import type { ChatStatus, UIMessage } from "ai"
import { LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#components/ui/message-scroller"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "#components/ui/trace"

import { ChatMessage } from "./message"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/chat
// 사람의 메시지를 스크롤 기준점으로 삼아, 새 질문이 위쪽에 자리 잡고 그 아래로 답변이 이어진다.

export type ChatThreadProps = {
  messages: UIMessage[]
  status: ChatStatus
  /** 메시지가 없을 때 보일 내용 */
  empty?: React.ReactNode
  className?: string
  /** MessageScrollerContent에 덧붙일 클래스. 좌우 여백 조정용 */
  contentClassName?: string
}

export function ChatThread({
  messages,
  status,
  empty,
  className,
  contentClassName,
}: ChatThreadProps) {
  const busy = status === "submitted" || status === "streaming"
  const last = messages.at(-1)

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        {empty ?? "무엇이든 물어보세요."}
      </div>
    )
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={className}>
        <MessageScrollerViewport>
          <MessageScrollerContent
            aria-busy={busy}
            className={cn("gap-6 px-6 py-6", contentClassName)}
          >
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <ChatMessage
                  message={message}
                  streaming={busy && message === last}
                />
              </MessageScrollerItem>
            ))}
            {status === "submitted" && last?.role === "user" && (
              <MessageScrollerItem messageId="pending">
                <Trace>
                  <TraceLine status="running">
                    <TraceIcon>
                      <LoaderCircleIcon className="animate-spin" />
                    </TraceIcon>
                    <TraceTitle>응답을 기다리는 중</TraceTitle>
                  </TraceLine>
                </Trace>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
