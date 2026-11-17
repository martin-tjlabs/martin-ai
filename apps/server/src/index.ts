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

const INSTRUCTIONS =
  "당신은 간결하게 답하는 한국어 도우미입니다. 필요하면 마크다운을 쓰고, 현재 날짜나 시각이 필요하면 getCurrentTime 도구를 사용하세요."

const app = new Hono()

// 화면의 모델 선택 메뉴가 읽는 허용 목록. 대본 모드에서는 빈 목록.
app.get("/api/models", (c) =>
  c.json({ models: allowedModels, defaultModel })
)

app.post("/api/chat", async (c) => {
  const body = await c.req.json<{ messages: UIMessage[]; model?: unknown }>()
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

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(5),
    abortSignal: c.req.raw.signal,
    // 추론을 내보내는 모델이 그 과정을 스트림에 싣도록 요청한다. 해당 회사가 아닌 옵션은 무시된다.
    providerOptions: {
      anthropic: { thinking: { type: "adaptive", display: "summarized" } },
      openai: { reasoningSummary: "auto" },
      google: { thinkingConfig: { includeThoughts: true } },
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      // 원인은 서버 로그에만 남기고, 클라이언트에는 일반 문구만 보낸다
      onError: (error) => {
        console.error(error)
        return "An error occurred."
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
