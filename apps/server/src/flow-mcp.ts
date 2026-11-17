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
// - 서버를 다시 띄우면 세션, 토큰, 클라이언트 등록이 모두 비워진다. 연결 해제는 재시작으로 한다.

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
// 개발 중에는 playground(Vite)가 /api를 이 서버로 프록시하므로 playground 주소를 쓴다.
// PUBLIC_URL이 있으면 그대로 쓰고, 없으면 playground와 같은 PLAYGROUND_PORT(기본 5180)로 만든다.
const PUBLIC_URL = (
  process.env.PUBLIC_URL ??
  `http://localhost:${process.env.PLAYGROUND_PORT ?? 5180}`
).replace(/\/$/, "")
export const CALLBACK_PATH = "/api/mcp/oauth/callback"
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

// 개발용: FLOW_DEBUG_PRINT_TOKENS=1일 때만 받은(또는 갱신한) 토큰을 서버 터미널에 출력한다.
// 기본은 꺼져 있다. 토큰은 비밀값이므로 공유하는 로그나 화면에는 켜지 않는다.
function printTokensForDebug(tokens: OAuthTokens) {
  if (process.env.FLOW_DEBUG_PRINT_TOKENS !== "1") return
  console.log("[flow-mcp] (개발용) FLOW 토큰을 받았습니다:", {
    access_token: tokens.access_token,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
    refresh_token: tokens.refresh_token,
  })
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
      printTokensForDebug(tokens)
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

// 채팅 요청 하나에서 쓸 FLOW 도구.
// - 이 세션이 FLOW 로그인(OAuth)으로 받아 둔 토큰이 있으면 그 토큰으로 MCP에 연결해 허용 도구를 준다.
//   만료되면 SDK가 refresh로 갱신한다.
// - 토큰이 없거나 갱신도 실패하면 로그인 URL을 돌려주는 connectFlow 도구 하나만 준다.
type FlowTools = {
  tools: ToolSet
  connected: boolean
  close: () => Promise<void>
}

export async function getFlowTools(sessionId: string): Promise<FlowTools> {
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
    tools: { connectFlow: createConnectTool(sessionId) },
    connected: false,
    close: async () => {},
  }
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

function createConnectTool(sessionId: string) {
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
}): Promise<CallbackResult> {
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

export type CallbackResult = {
  ok: boolean
  message: string
}

// 콜백 창에 보여 줄 페이지. 결과를 같은 출처의 채팅 화면에 BroadcastChannel로 알리고 창을 닫는다.
// (Google 로그인 페이지를 거치면 window.opener가 끊길 수 있어 postMessage 대신 쓴다.)
// 알림에는 결과만 싣고 토큰은 싣지 않는다.
export function callbackPage(result: CallbackResult) {
  // 인라인 스크립트 안에 넣으므로 </script> 같은 문자열이 끼어들지 못하게 < 를 이스케이프한다
  const payload = JSON.stringify({
    type: "martin-ai:auth",
    status: result.ok ? "connected" : "failed",
    service: "FLOW",
  }).replace(/</g, "\\u003c")
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
