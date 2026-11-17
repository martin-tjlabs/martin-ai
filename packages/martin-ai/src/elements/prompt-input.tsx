import * as React from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import type { ChatStatus } from "ai"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#components/ui/input-group"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/prompt-input
// 선택 사항인 첨부는 뺐다. 응답 중에는 전송 버튼이 중단 버튼으로 바뀐다.
// 모델 선택 같은 메뉴는 actions로 받아 전송 버튼 옆에 둔다.

export type PromptInputProps = {
  /** 공백을 제거한 입력 문자열로 호출된다 */
  onSubmit: (text: string) => void
  /** 응답 도중 중단 버튼을 누르면 호출된다 */
  onStop?: () => void
  status: ChatStatus
  placeholder?: string
  /** 전송 버튼 왼쪽에 둘 요소. 예: <ModelSelector /> */
  actions?: React.ReactNode
  className?: string
}

export function PromptInput({
  onSubmit,
  onStop,
  status,
  placeholder = "메시지를 입력하세요",
  actions,
  className,
}: PromptInputProps) {
  const [text, setText] = React.useState("")
  const formRef = React.useRef<HTMLFormElement>(null)
  const busy = status === "submitted" || status === "streaming"
  const canSend = text.trim().length > 0 && !busy

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) {
      return
    }

    onSubmit(text.trim())
    setText("")
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={className}>
      <InputGroup>
        <InputGroupTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label="메시지"
          className="min-h-14 p-3"
          onKeyDown={(event) => {
            // Enter는 전송, Shift+Enter는 줄바꿈. 한글 조합 중의 Enter는 무시한다.
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <div className="ml-auto flex items-center gap-1">
          {actions}
          {busy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="default"
              className="rounded-full"
              aria-label="중단"
              onClick={onStop}
            >
              <SquareIcon className="fill-current" />
            </InputGroupButton>
          ) : (
            // disabled 속성을 쓰면 InputGroup의 has-disabled 스타일이 입력창 전체를
            // 흐리게 만들어 입력할 수 없는 것처럼 보인다. 그래서 aria-disabled로
            // 버튼만 흐리게 하고, 빈 입력은 handleSubmit에서 막는다.
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              className="rounded-full aria-disabled:cursor-default aria-disabled:opacity-40"
              aria-disabled={!canSend}
              aria-label="전송"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
