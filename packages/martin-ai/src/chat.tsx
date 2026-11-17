import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type ChatTransport, type UIMessage } from "ai"
import { cn } from "cn"

import { ChatError } from "./elements/chat-error"
import { ChatThread } from "./elements/chat-thread"
import { EffortSelector } from "./elements/effort-selector"
import { ModelSelector } from "./elements/model-selector"
import { PromptInput } from "./elements/prompt-input"
import { useAuthComplete } from "./auth"
import { useChatModels } from "./models"

export type ChatProps = {
  /** 채팅 엔드포인트 주소. 기본값은 "/api/chat" */
  api?: string
  /** 모델 목록 엔드포인트 주소. 기본값은 "/api/models". 모델이 2개 이상이면 선택 메뉴를 보인다 */
  modelsApi?: string
  /** 주어지면 api 대신 사용 */
  transport?: ChatTransport<UIMessage>
  /** 입력창 안내 문구. 기본값은 "메시지를 입력하세요" */
  placeholder?: string
  /** 루트 요소에 덧붙일 클래스 */
  className?: string
}

// useChat과 elements를 연결한 기본 채팅 화면. 부모 요소의 높이를 채운다.
export function Chat({
  api = "/api/chat",
  modelsApi = "/api/models",
  transport,
  placeholder = "메시지를 입력하세요",
  className,
}: ChatProps) {
  const chatTransport = React.useMemo(
    () => transport ?? new DefaultChatTransport({ api }),
    [transport, api]
  )
  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    transport: chatTransport,
  })
  const { models, model, setModel, efforts, effort, setEffort, body } =
    useChatModels(modelsApi)

  // 도구 인증(예: FLOW 연결)을 별도 창에서 마치면, 연결을 요구했던 마지막 답변을 다시 받는다.
  useAuthComplete((event) => {
    const busy = status === "submitted" || status === "streaming"
    if (event.status === "connected" && !busy && messages.at(-1)?.role === "assistant") {
      void regenerate(body ? { body } : undefined)
    }
  })

  return (
    <div
      data-slot="martin-ai-chat"
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-background font-sans text-foreground",
        className
      )}
    >
      <ChatThread
        messages={messages}
        status={status}
        className="min-h-0 flex-1"
      />
      <div className="flex flex-col gap-2 p-4 pt-2">
        <ChatError error={error} />
        <PromptInput
          status={status}
          placeholder={placeholder}
          // 고른 모델과 사고 수준은 요청 본문의 model, effort로 보낸다. 허용 여부는 서버가 판단한다.
          onSubmit={(text) => void sendMessage({ text }, body ? { body } : undefined)}
          onStop={() => void stop()}
          actions={
            <>
              <ModelSelector
                models={models}
                value={model}
                onValueChange={setModel}
              />
              <EffortSelector
                efforts={efforts}
                value={effort}
                onValueChange={setEffort}
              />
            </>
          }
        />
      </div>
    </div>
  )
}
