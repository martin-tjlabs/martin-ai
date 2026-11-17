import * as React from "react"
import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react"

import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#components/ui/trace"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/reasoning

export type ReasoningLineProps = {
  text: string
  /** 모델이 아직 생각하는 중이면 true */
  running: boolean
}

// 생각하는 동안 열려 있다가 끝나면 닫힌다. 사용자가 직접 열고 닫으면 그 선택을 따른다.
export function ReasoningLine({ text, running }: ReasoningLineProps) {
  const [open, setOpen] = React.useState<boolean>()

  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        {running ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <CircleCheckIcon />
        )}
      </TraceIcon>
      <TraceTitle>{running ? "생각하는 중" : "생각 완료"}</TraceTitle>
    </TraceLine>
  )

  if (text.length === 0) {
    return line
  }

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
