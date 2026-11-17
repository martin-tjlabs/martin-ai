import { randomBytes } from "node:crypto"

import {
  auth,
  createMCPClient,
  UnauthorizedError,
  type OAuthAuthorizationServerInformation,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from "@ai-sdk/mcp"
import { jsonSchema, tool, type ToolSet } from "ai"

// FLOW MCP 서버를 정적으로 붙인다.
// - 연결 대상(주소)과 허용 도구는 이 파일에 고정한다. 요청으로는 바꿀 수 없다.
// - 인증은 사용자(브라우저 세션)별이다. FLOW 인증 서버에서 Sign in with Google을 마치면
//   FLOW가 자체 access token을 발급하고, 백엔드는 그 토큰을 세션에 묶어 메모리에만 둔다.
// - 토큰은 브라우저로 보내지 않는다. MCP 요청의 Authorization 헤더에만 실린다.

export const FLOW_MCP_URL = "https://mcp.flow.tjlabscorp.com/mcp"
const FLOW_AUTH_SERVER_URL = "https://mcp-auth.flow.tjlabscorp.com/"

// MCP 서버와 인증 서버 두 곳에만 요청을 보낸다. 서버 메타데이터가 다른 주소를 가리켜도
// 따라가지 않는다(SSRF 방지). @ai-sdk/mcp는 다른 출처의 인증 서버에 요청할 때
// 전역 fetch 대신 이렇게 검증하는 fetch를 요구한다.
const ALLOWED_HOSTS = new Set(
  [FLOW_MCP_URL, FLOW_AUTH_SERVER_URL].map((url) => new URL(url).host)
)

const flowFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) {
    return Promise.reject(
      new Error(`[flow-mcp] 허용되지 않은 주소로의 요청을 막았습니다: ${url.origin}`)
    )
  }
  return fetch(input, init)
}

const ALLOWED_TOOLS = new Set([
  "about_flow",
  "list_sectors",
  "get_user_count",
  "get_hourly_visitors",
  "get_peak_hours",
  "get_daily_history",
  "compare_periods",
  "get_zone_stats",
  "get_ward_health",
])

// 브라우저가 보는 주소. 인증 서버가 로그인 뒤 이 주소의 콜백으로 돌아온다.
// 개발 중에는 playground(Vite)가 /api를 이 서버로 프록시한다.
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(
  /\/$/,
  ""
)
export const CALLBACK_PATH = "/api/mcp/oauth/callback"
// 호스트가 이미 가진 FLOW access token을 실어 보내는 요청 헤더
export const FLOW_TOKEN_HEADER = "X-Flow-Access-Token"
const REDIRECT_URL = `${PUBLIC_URL}${CALLBACK_PATH}`

// 저장소 (메모리). 서버를 다시 띄우면 비워지고, 사용자는 FLOW 연결을 다시 해야 한다.

type FlowSession = {
  tokens?: OAuthTokens
  authorizationUrl?: string
}

// 로그인 시도 하나. 연결 버튼이 여러 번 생겨도 각 시도의 PKCE 값이 섞이지 않도록
// state별로 따로 보관한다. 로그인 창에서 돌아올 때 state로 찾고, 10분이 지나면 버린다.
type AuthAttempt = {
  sessionId: string
  state: string
  expiresAt: number
  codeVerifier?: string
  authorizationServer?: OAuthAuthorizationServerInformation
}

const sessions = new Map<string, FlowSession>()
const attempts = new Map<string, AuthAttempt>()
const STATE_TTL_MS = 10 * 60 * 1000

// 이 백엔드를 인증 서버에 등록한 결과(client_id, client_secret). 모든 세션이 함께 쓴다.
let registeredClient: OAuthClientInformation | undefined

function getSession(sessionId: string) {
  let session = sessions.get(sessionId)
  if (!session) {
    session = {}
    sessions.set(sessionId, session)
  }
  return session
}

function pruneAttempts() {
  const now = Date.now()
  for (const [state, attempt] of attempts) {
    if (attempt.expiresAt < now) attempts.delete(state)
  }
}

const clientMetadata: OAuthClientMetadata = {
  client_name: "martin-ai demo",
  redirect_uris: [REDIRECT_URL],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "client_secret_post",
  scope: "flow",
}

// 세션 하나에 대한 OAuthClientProvider. @ai-sdk/mcp가 인증 서버 탐색, 클라이언트 등록,
// PKCE, state 검증, 토큰 교환과 갱신을 처리하고, 결과를 여기에 저장한다.
// attempt를 주면(콜백) 그 로그인 시도의 state와 PKCE 값으로 토큰을 교환한다.
function createProvider(sessionId: string, attempt?: AuthAttempt): OAuthClientProvider {
  const session = getSession(sessionId)
  let current = attempt

  return {
    get redirectUrl() {
      return REDIRECT_URL
    },
    get clientMetadata() {
      return clientMetadata
    },
    clientInformation: () => registeredClient,
    saveClientInformation: (info) => {
      registeredClient = info
    },
    isClientInformationDynamicallyRegistered: () => true,
    // FLOW 인증 서버는 메타데이터에 client_secret_basic도 적어 두었지만 실제로는
    // Authorization 헤더를 읽지 않고 본문의 client_id만 본다(basic이면 401 invalid_client).
    // SDK는 basic을 먼저 고르므로, 등록한 방식인 client_secret_post를 직접 적용한다.
    // 토큰 교환과 갱신 요청 모두 이 함수를 거친다.
    addClientAuthentication: (headers, params) => {
      if (!registeredClient) {
        throw new Error("[flow-mcp] 등록된 OAuth 클라이언트가 없습니다.")
      }
      headers.delete("Authorization")
      params.set("client_id", registeredClient.client_id)
      if (registeredClient.client_secret) {
        params.set("client_secret", registeredClient.client_secret)
      }
    },
    tokens: () => session.tokens,
    saveTokens: (tokens) => {
      session.tokens = tokens
    },
    state: () => randomBytes(24).toString("base64url"),
    // SDK 순서: state() → saveState → saveAuthorizationServerInformation → saveCodeVerifier
    saveState: (state) => {
      pruneAttempts()
      current = { sessionId, state, expiresAt: Date.now() + STATE_TTL_MS }
      attempts.set(state, current)
    },
    storedState: () => current?.state,
    saveCodeVerifier: (verifier) => {
      if (!current) throw new Error("[flow-mcp] 로그인 시도가 없습니다.")
      current.codeVerifier = verifier
    },
    codeVerifier: () => {
      if (!current?.codeVerifier) {
        throw new Error("[flow-mcp] PKCE code verifier가 없습니다.")
      }
      return current.codeVerifier
    },
    authorizationServerInformation: () => current?.authorizationServer,
    saveAuthorizationServerInformation: (info) => {
      if (current) current.authorizationServer = info
    },
    // 로그인이 필요할 때 SDK가 부른다. 서버에는 브라우저가 없으므로 URL만 보관하고,
    // connectFlow 도구가 이 URL을 화면으로 돌려준다.
    redirectToAuthorization: (url) => {
      session.authorizationUrl = url.toString()
    },
    // 메타데이터가 알려 준 인증 서버가 고정한 주소와 같을 때만 진행한다.
    validateAuthorizationServerURL: (_serverUrl, authorizationServerUrl) => {
      if (new URL(authorizationServerUrl).href !== FLOW_AUTH_SERVER_URL) {
        throw new Error(
          `[flow-mcp] 예상하지 않은 인증 서버입니다: ${authorizationServerUrl}`
        )
      }
    },
    invalidateCredentials: (scope) => {
      if (scope === "all" || scope === "tokens") session.tokens = undefined
      if ((scope === "all" || scope === "verifier") && current) {
        current.codeVerifier = undefined
      }
      if (scope === "all" || scope === "client") registeredClient = undefined
    },
  }
}

// 채팅 요청 하나에서 쓸 FLOW 도구. 토큰은 다음 순서로 찾는다.
// 1. 브라우저가 보낸 토큰(presetToken): 호스트가 FLOW 웹 앱의 localStorage에서 읽어
//    X-Flow-Access-Token 헤더로 보낸 것. 서버에 저장하지 않고 이 요청에만 쓴다.
// 2. 이 세션이 FLOW 로그인(OAuth)으로 받아 둔 토큰. 만료되면 SDK가 refresh로 갱신한다.
// 3. 둘 다 쓸 수 없으면 로그인 URL을 돌려주는 connectFlow 도구 하나만 준다.
// 토큰이 있다고 믿지 않고 실제로 연결해 본다. MCP 서버가 거절하면 다음 순서로 넘어간다.
export async function getFlowTools(
  sessionId: string,
  presetToken?: string
): Promise<{
  tools: ToolSet
  connected: boolean
  close: () => Promise<void>
}> {
  // 브라우저가 보낸 토큰을 쓰지 못한 이유. connectFlow 결과에 실어 화면에도 보인다.
  let presetTokenIssue: string | undefined

  if (presetToken) {
    try {
      return await connectFlowMcp({
        type: "http",
        url: FLOW_MCP_URL,
        headers: { Authorization: `Bearer ${presetToken}` },
        fetch: flowFetch,
      })
    } catch (error) {
      presetTokenIssue = describePresetTokenIssue(presetToken, error)
      // 토큰 값은 로그에 남기지 않는다. 형식과 JWT의 공개 클레임만 남긴다.
      console.warn(
        "[flow-mcp] 브라우저가 보낸 FLOW 토큰으로 연결하지 못해 로그인 흐름으로 넘어갑니다:",
        presetTokenIssue,
        inspectToken(presetToken)
      )
    }
  }

  const session = getSession(sessionId)

  if (session.tokens) {
    try {
      return await connectFlowMcp({
        type: "http",
        url: FLOW_MCP_URL,
        authProvider: createProvider(sessionId),
        fetch: flowFetch,
      })
    } catch (error) {
      // 토큰이 만료되고 갱신도 실패하면 SDK가 토큰을 지우고 UnauthorizedError를 던진다.
      if (!(error instanceof UnauthorizedError)) {
        console.error("[flow-mcp] 연결 실패", error)
      }
      session.tokens = undefined
    }
  }

  return {
    tools: { connectFlow: createConnectTool(sessionId, presetTokenIssue) },
    connected: false,
    close: async () => {},
  }
}

// 토큰 값은 드러내지 않고, 진단에 필요한 형식 정보와 JWT의 공개 클레임만 뽑는다.
function inspectToken(token: string) {
  const info: Record<string, unknown> = {
    length: token.length,
    quoted: /^["'].*["']$/.test(token),
    bearerPrefix: /^bearer\s/i.test(token),
  }
  const parts = token.split(".")
  info.jwt = parts.length === 3
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      ) as Record<string, unknown>
      info.iss = payload.iss
      info.aud = payload.aud
      info.scope = payload.scope ?? payload.scp
      if (typeof payload.exp === "number") {
        info.exp = new Date(payload.exp * 1000).toISOString()
        info.expired = payload.exp * 1000 < Date.now()
      }
    } catch {
      info.jwtPayload = "읽을 수 없음"
    }
  }
  return info
}

function describePresetTokenIssue(token: string, error: unknown) {
  const info = inspectToken(token)
  const reasons: string[] = []
  if (info.quoted) reasons.push("값이 따옴표로 감싸져 있습니다")
  if (info.bearerPrefix) reasons.push('값에 "Bearer " 접두사가 들어 있습니다')
  if (info.expired) reasons.push(`토큰이 만료되었습니다(${String(info.exp)})`)
  const message = error instanceof Error ? error.message : String(error)
  const status = /HTTP (\d{3})/.exec(message)?.[1]
  const code = /"error":\s*"([^"]+)"/.exec(message)?.[1]
  reasons.push(
    status
      ? `MCP 서버가 거절했습니다(HTTP ${status}${code ? `, ${code}` : ""})`
      : `MCP 서버에 연결하지 못했습니다(${message.slice(0, 120)})`
  )
  return reasons.join(" · ")
}

// MCP에 연결해 허용 도구만 골라 돌려준다. 실패하면 연결을 닫고 오류를 그대로 던진다.
async function connectFlowMcp(
  transport: Parameters<typeof createMCPClient>[0]["transport"]
) {
  const client = await createMCPClient({ transport, clientName: "martin-ai" })
  try {
    const all = await client.tools()
    const tools: ToolSet = {}
    for (const [name, value] of Object.entries(all)) {
      if (ALLOWED_TOOLS.has(name)) {
        tools[name] = value
      } else {
        console.warn(`[flow-mcp] 허용 목록에 없는 도구를 뺐습니다: ${name}`)
      }
    }
    return { tools, connected: true, close: () => client.close() }
  } catch (error) {
    await client.close().catch(() => {})
    throw error
  }
}

function createConnectTool(sessionId: string, presetTokenIssue?: string) {
  return tool({
    description:
      "FLOW는 공간(sector)의 층별 현재 인원, 방문자 수, 시간대별 혼잡 패턴, 구역별 인원과 체류 시간, 와드(S-Ward) 동작 상태를 제공하는 서비스다. " +
      "FLOW 데이터를 조회하려면 먼저 사용자의 FLOW 계정 연결이 필요하다. 사용자가 이런 데이터를 물으면 이 도구를 호출하라.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      const session = getSession(sessionId)
      session.authorizationUrl = undefined
      // 갱신 가능한 토큰이 있으면 AUTHORIZED, 없으면 로그인 URL을 만들고 REDIRECT
      const result = await auth(createProvider(sessionId), {
        serverUrl: FLOW_MCP_URL,
        fetchFn: flowFetch,
      })

      if (result === "AUTHORIZED") {
        return {
          status: "connected" as const,
          service: "FLOW",
          message: "FLOW에 연결되어 있습니다. 같은 질문을 다시 보내 주세요.",
        }
      }

      return {
        status: "auth-required" as const,
        service: "FLOW",
        authorizationUrl: session.authorizationUrl,
        // 브라우저의 토큰이 있었는데 쓰지 못했다면 그 이유
        detail: presetTokenIssue
          ? `브라우저의 FLOW 토큰을 쓰지 못했습니다: ${presetTokenIssue}`
          : undefined,
        message:
          "FLOW 연결이 필요합니다. 화면의 'FLOW 연결' 버튼을 눌러 Google 계정으로 로그인해 주세요.",
      }
    },
  })
}

// 인증 서버가 로그인 뒤 돌려보내는 콜백. code를 토큰으로 바꿔 세션에 저장한다.
export async function handleOAuthCallback(params: {
  code?: string
  state?: string
  iss?: string
  error?: string
  sessionId?: string
}): Promise<{ ok: boolean; message: string }> {
  if (params.error) {
    return { ok: false, message: `로그인이 취소되었거나 실패했습니다. (${params.error})` }
  }
  if (!params.code || !params.state) {
    return { ok: false, message: "인증 응답에 code나 state가 없습니다." }
  }

  const attempt = attempts.get(params.state)
  attempts.delete(params.state)
  if (!attempt || attempt.expiresAt < Date.now()) {
    return { ok: false, message: "로그인 요청이 만료되었습니다. 다시 연결해 주세요." }
  }
  // 로그인을 시작한 브라우저와 돌아온 브라우저가 같은지 확인한다(로그인 CSRF 방지).
  if (params.sessionId !== attempt.sessionId) {
    return { ok: false, message: "로그인을 시작한 브라우저에서 다시 시도해 주세요." }
  }

  try {
    await auth(createProvider(attempt.sessionId, attempt), {
      serverUrl: FLOW_MCP_URL,
      authorizationCode: params.code,
      callbackState: params.state,
      callbackIssuer: params.iss,
      fetchFn: flowFetch,
    })
    getSession(attempt.sessionId).authorizationUrl = undefined
    return { ok: true, message: "FLOW에 연결되었습니다. 이 창은 닫아도 됩니다." }
  } catch (error) {
    console.error("[flow-mcp] 토큰 교환 실패", error)
    // 인증 서버의 OAuth 오류 코드와 설명만 보인다(토큰이나 비밀키는 들어 있지 않다)
    const reason = error instanceof Error ? error.message.slice(0, 200) : String(error)
    return {
      ok: false,
      message: `토큰을 발급받지 못했습니다. 다시 시도해 주세요. (${reason})`,
    }
  }
}

// 콜백 창에 보여 줄 페이지. 결과를 같은 출처의 채팅 화면에 BroadcastChannel로 알리고 창을 닫는다.
// (Google 로그인 페이지를 거치면 window.opener가 끊길 수 있어 postMessage 대신 쓴다.)
export function callbackPage(result: { ok: boolean; message: string }) {
  const payload = JSON.stringify({
    type: "martin-ai:auth",
    status: result.ok ? "connected" : "failed",
  })
  const escaped = result.message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>FLOW 연결</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#222}</style>
</head>
<body>
<p>${escaped}</p>
<script>
  try { new BroadcastChannel("martin-ai-auth").postMessage(${payload}) } catch (e) {}
  ${result.ok ? "setTimeout(function () { window.close() }, 800)" : ""}
</script>
</body>
</html>`
}

export function newSessionId() {
  return randomBytes(24).toString("base64url")
}
