import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { serve } from "@hono/node-server"
import {
  convertToModelMessages,
  createProviderRegistry,
  createUIMessageStreamResponse,
  isStepCount,
  jsonSchema,
  simulateReadableStream,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"

import { toClientErrorMessage } from "./client-error.ts"
import {
  CALLBACK_PATH,
  callbackPage,
  flowToolOutputConverters,
  getFlowTools,
  handleOAuthCallback,
  newSessionId,
} from "./flow-mcp.ts"

// 모델: CHAT_MODELS가 비어 있으면 고정된 문장을 스트리밍하는 대본 모드.

const registry = createProviderRegistry({ anthropic, openai, google })

const SCRIPT = `대본 모드로 응답하고 있습니다. 서버의 \`CHAT_MODELS\`가 비어 있어서 실제 모델 대신 고정된 문장을 보냅니다.

**실제 모델로 바꾸려면**

1. \`apps/server/.env\`에 API 키를 적습니다.
2. \`CHAT_MODELS\`에 \`anthropic:모델명\` 같은 형식으로 쉼표를 넣어 나열합니다.
3. 서버를 다시 띄웁니다.

\`\`\`bash
CHAT_MODELS=anthropic:claude-sonnet-5-5,openai:gpt-5
\`\`\`

도구 호출과 추론 과정은 실제 모델에서 확인할 수 있습니다.`

function createScriptedModel() {
  // 실제 스트리밍처럼 보이도록 몇 글자씩 잘라 보낸다
  const deltas = SCRIPT.match(/[\s\S]{1,4}/g) ?? []

  return new MockLanguageModelV4({
    provider: "script",
    modelId: "script",
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 300,
        chunkDelayInMs: 20,
        chunks: [
          { type: "text-start", id: "script" },
          ...deltas.map((delta) => ({
            type: "text-delta" as const,
            id: "script",
            delta,
          })),
          { type: "text-end", id: "script" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  })
}

// 허용 모델 목록. CHAT_MODELS에 "회사:모델명"을 쉼표로 나열하고, 첫 번째가 기본 모델이다.
// 서버가 뜰 때 registry로 미리 만들어 두므로, 등록되지 않은 회사 접두사는 여기서 바로 실패한다.

type AllowedModel = { id: string; provider: string; name: string }

const allowedModels: AllowedModel[] = (process.env.CHAT_MODELS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index)
  .map((id) => {
    const separator = id.indexOf(":")
    return {
      id,
      provider: id.slice(0, separator),
      name: id.slice(separator + 1),
    }
  })

const languageModels = new Map<string, LanguageModel>(
  allowedModels.map(({ id }) => [
    id,
    registry.languageModel(id as `anthropic:${string}`),
  ])
)
const defaultModel = allowedModels[0]?.id ?? null
const scriptedModel = createScriptedModel()

// 사고 수준(effort). 화면에서 고를 수 있는 값은 서버가 정한다. 고르지 않으면 모델 기본값을 쓴다.
// provider마다 받는 옵션이 달라서 아래 effortOptions에서 바꿔 넘긴다.
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
type Effort = (typeof EFFORTS)[number]

function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value)
}

// provider별 사고 수준 옵션. 해당 회사가 아닌 옵션은 무시된다.
// Google thinkingLevel에는 max가 없어 xhigh로 낮춘다.
function effortOptions(effort: Effort | undefined) {
  if (!effort) return { anthropic: {}, openai: {}, google: {} }
  return {
    anthropic: { effort },
    openai: { reasoningEffort: effort },
    google: { thinkingLevel: effort === "max" ? "xhigh" : effort },
  }
}

// 도구: 외부 호출 없이 서버 시각을 돌려준다. 도구 호출 UI 확인용.

const tools = {
  getCurrentTime: tool({
    description: "서버의 현재 날짜와 시각을 돌려준다.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      const now = new Date()
      return {
        iso: now.toISOString(),
        local: now.toLocaleString("ko-KR"),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    },
  }),
}

const INSTRUCTIONS = [
  "당신은 간결하게 답하는 한국어 도우미입니다. 필요하면 마크다운을 쓰고, 현재 날짜나 시각이 필요하면 getCurrentTime 도구를 사용하세요.",
  "공간의 인원, 방문자, 혼잡도, 구역, 와드(S-Ward) 같은 FLOW 데이터는 FLOW 도구로 조회하세요.",
  "connectFlow 도구가 FLOW 연결이 필요하다고 알려 주면, 데이터를 추측하지 말고 화면의 'FLOW 연결' 버튼을 눌러 로그인해 달라고 짧게 안내하세요.",
].join("\n")

// 세션: 브라우저마다 익명 세션 쿠키 하나를 둔다. FLOW 토큰은 이 세션에 묶여 서버에만 있다.
type Env = { Variables: { sessionId: string } }
const SESSION_COOKIE = "martin_ai_sid"

const app = new Hono<Env>()

app.use("/api/*", async (c, next) => {
  let sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) {
    sessionId = newSessionId()
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    })
  }
  c.set("sessionId", sessionId)
  await next()
})

// FLOW 인증 서버가 Sign in with Google 뒤 돌려보내는 곳. 별도 창에서 열린다.
app.get(CALLBACK_PATH, async (c) => {
  const result = await handleOAuthCallback({
    code: c.req.query("code"),
    state: c.req.query("state"),
    iss: c.req.query("iss"),
    error: c.req.query("error"),
    sessionId: getCookie(c, SESSION_COOKIE),
  })
  // 일회용 code와 state가 담긴 요청의 결과 페이지이므로 캐시하지 않는다
  c.header("Cache-Control", "no-store")
  return c.html(callbackPage(result), result.ok ? 200 : 400)
})

// 화면의 모델 선택 메뉴가 읽는 허용 목록. 대본 모드에서는 빈 목록.
// 화면의 모델·사고 수준 메뉴가 읽는 허용 목록. 대본 모드에서는 둘 다 빈 목록.
app.get("/api/models", (c) =>
  c.json({
    models: allowedModels,
    defaultModel,
    efforts: allowedModels.length > 0 ? EFFORTS : [],
  })
)

app.post("/api/chat", async (c) => {
  const body = await c.req.json<{
    messages: UIMessage[]
    model?: unknown
    effort?: unknown
  }>()
  const { messages } = body

  // 클라이언트는 모델 ID만 보낸다. 허용 목록에 없는 값은 받지 않는다.
  let model: LanguageModel
  if (body.model === undefined) {
    model = defaultModel ? languageModels.get(defaultModel)! : scriptedModel
  } else {
    const requested =
      typeof body.model === "string" ? languageModels.get(body.model) : undefined
    if (!requested) {
      return c.json({ error: "허용되지 않은 모델입니다." }, 400)
    }
    model = requested
  }

  // 사고 수준도 허용 목록에 있는 값만 받는다. 없으면 모델 기본값을 쓴다.
  if (body.effort !== undefined && !isEffort(body.effort)) {
    return c.json({ error: "허용되지 않은 사고 수준입니다." }, 400)
  }
  const effort = body.effort
  const effortByProvider = effortOptions(effort)

  // FLOW 도구는 요청마다 이 세션의 토큰으로 연결하고, 응답이 끝나면 연결을 닫는다.
  const flow = await getFlowTools(c.get("sessionId"))
  const requestTools = { ...tools, ...flow.tools }
  let closed = false
  const closeFlow = () => {
    if (closed) return
    closed = true
    flow.close().catch((error) => console.error("[flow-mcp] 닫기 실패", error))
  }

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    // 응답 도중 중단하거나 끊겨 결과 없이 남은 도구 호출은 빼고 보낸다. 그대로 두면
    // MissingToolResultsError로 모델 호출이 거절되고, 그 대화의 이후 요청이 모두 실패한다.
    // 도구 결과는 실행한 턴과 같은 형태로 다시 만들어야 이전 사고 블록이 유효하다.
    // FLOW에 연결되지 않은 턴에도 FLOW 도구 결과의 형태가 같도록 변환을 함께 넘긴다.
    messages: await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
      tools: { ...flowToolOutputConverters, ...requestTools },
    }),
    tools: requestTools,
    stopWhen: isStepCount(5),
    abortSignal: c.req.raw.signal,
    onEnd: closeFlow,
    onAbort: closeFlow,
    onError: ({ error }) => {
      console.error(error)
      closeFlow()
    },
    // 추론을 내보내는 모델이 그 과정을 스트림에 싣도록 요청한다. 해당 회사가 아닌 옵션은 무시된다.
    providerOptions: {
      // 사고 수준을 고르면 provider별 effort 옵션을 함께 싣는다
      anthropic: {
        thinking: {
          type: "adaptive",
          display: "summarized",
          // 그래도 기록이 어긋나면 요청을 실패시키지 않고 어긋난 사고 블록만 버린다
          blockBinding: { prefixMismatchBehavior: "drop_block" },
        },
        ...effortByProvider.anthropic,
      },
      openai: { reasoningSummary: "auto", ...effortByProvider.openai },
      google: {
        thinkingConfig: { includeThoughts: true, ...effortByProvider.google },
      },
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools: requestTools,
      // 원인은 서버 로그에만 남기고, 클라이언트에는 원인 종류에 맞춘 짧은 문구만 보낸다
      onError: (error) => {
        console.error(error)
        return toClientErrorMessage(error)
      },
    }),
  })
})

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`server: http://localhost:${info.port}`)
  console.log(
    allowedModels.length > 0
      ? `models: ${allowedModels.map(({ id }) => id).join(", ")} (기본: ${defaultModel})`
      : "models: 대본 모드 (CHAT_MODELS 없음)"
  )
})
