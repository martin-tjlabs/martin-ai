import { isReasoningUIPart, isToolUIPart, type UIMessage } from "ai"

import { Bubble, BubbleContent } from "#components/ui/bubble"
import { Message, MessageContent } from "#components/ui/message"
import { Trace } from "#components/ui/trace"

import { Markdown } from "./markdown"
import { ReasoningLine } from "./reasoning"
import { ToolLine } from "./tool"
import { getMessageText } from "./utils"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/message
// 선택 사항인 메시지 액션(복사, 재시도)과 Tooltip은 뺐다.

export type UserMessageProps = {
  message: UIMessage
}

// 사람의 메시지. 오른쪽에 붙은 말풍선.
export function UserMessage({ message }: UserMessageProps) {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble align="end" variant="muted">
          <BubbleContent className="whitespace-pre-wrap">
            {getMessageText(message)}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export type AssistantMessageProps = {
  message: UIMessage
  /** 이 메시지가 지금 스트리밍 중이면 true */
  streaming?: boolean
}

// 에이전트의 답변. 추론과 도구 호출을 Trace로 먼저 보이고, 그 아래에 마크다운 본문을 둔다.
export function AssistantMessage({
  message,
  streaming = false,
}: AssistantMessageProps) {
  const steps = message.parts.filter(
    (part) => isReasoningUIPart(part) || isToolUIPart(part)
  )
  const reply = getMessageText(message)

  return (
    <Message>
      <MessageContent className="gap-3">
        {steps.length > 0 && (
          <Trace>
            {steps.map((part, index) =>
              isReasoningUIPart(part) ? (
                <ReasoningLine
                  key={index}
                  text={part.text}
                  running={streaming && part.state === "streaming"}
                />
              ) : isToolUIPart(part) ? (
                <ToolLine
                  key={part.toolCallId}
                  part={part}
                  streaming={streaming}
                />
              ) : null
            )}
          </Trace>
        )}
        {reply && <Markdown streaming={streaming}>{reply}</Markdown>}
      </MessageContent>
    </Message>
  )
}

export type ChatMessageProps = AssistantMessageProps

// 역할에 따라 UserMessage나 AssistantMessage를 그린다.
export function ChatMessage({ message, streaming }: ChatMessageProps) {
  if (message.role === "user") {
    return <UserMessage message={message} />
  }

  return <AssistantMessage message={message} streaming={streaming} />
}
