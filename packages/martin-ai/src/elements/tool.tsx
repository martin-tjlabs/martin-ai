import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai"
import { WrenchIcon } from "lucide-react"

import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockTitle,
} from "#components/ui/code-block"
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#components/ui/trace"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/tool
// 승인(approval) 상태는 이번 범위가 아니라서 다루지 않는다.

export type ToolPart = ToolUIPart | DynamicToolUIPart

export type ToolLineProps = {
  part: ToolPart
  /** 대화가 아직 스트리밍 중이면 true. 끝났는데 결과가 없으면 실패로 본다. */
  streaming: boolean
}

function toJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2)
}

function ToolCode({ title, children }: { title: string; children: string }) {
  return (
    <CodeBlock size="sm">
      <CodeBlockHeader>
        <CodeBlockTitle>{title}</CodeBlockTitle>
      </CodeBlockHeader>
      <CodeBlockContent wrap className="max-h-64">
        {children}
      </CodeBlockContent>
    </CodeBlock>
  )
}

// 실행 중에는 한 줄로, 결과가 오면 펼쳐서 입력과 결과를 볼 수 있는 줄로 표시한다.
export function ToolLine({ part, streaming }: ToolLineProps) {
  const name = getToolName(part)

  if (part.state === "output-available" || part.state === "output-error") {
    const failed = part.state === "output-error"

    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed ? "error" : undefined}>
            <TraceIcon>
              <WrenchIcon />
            </TraceIcon>
            <TraceTitle>
              {name} {failed ? "실행 실패" : "실행함"}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-2">
          <ToolCode title="입력">{toJson(part.input)}</ToolCode>
          {failed ? (
            <ToolCode title="오류">{part.errorText}</ToolCode>
          ) : (
            <ToolCode title="결과">{toJson(part.output)}</ToolCode>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    )
  }

  return (
    <TraceLine status={streaming ? "running" : "error"}>
      <TraceIcon>
        <WrenchIcon />
      </TraceIcon>
      <TraceTitle>
        {name} {streaming ? "실행 중" : "실행 실패"}
      </TraceTitle>
    </TraceLine>
  )
}
