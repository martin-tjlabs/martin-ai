import * as React from "react"
import {
  Streamdown,
  useIsCodeFenceIncomplete,
  type ExtraProps,
} from "streamdown"

import { useHighlightedCode } from "#hooks/use-highlighted-code"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "#components/ui/code-block"

// 출처: https://ui.shadcn.com/docs/components/base/code-block#markdown

function MarkdownCodeBlock({
  code,
  language,
}: {
  code: string
  language: string
}) {
  // 닫는 펜스가 아직 도착하지 않았으면 true
  const incomplete = useIsCodeFenceIncomplete()
  const lines = useHighlightedCode(code, language)

  return (
    <CodeBlock>
      <CodeBlockHeader>
        <CodeBlockTitle>{language || "text"}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={code} disabled={incomplete} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}

function MarkdownCode({
  node: _node,
  className,
  children,
  ...props
}: React.ComponentProps<"code"> & ExtraProps) {
  // Streamdown은 펜스 코드에만 data-block을 붙인다. 나머지는 인라인 코드.
  if (!("data-block" in props)) {
    return (
      <code
        className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        {...props}
      >
        {children}
      </code>
    )
  }

  return (
    <MarkdownCodeBlock
      code={typeof children === "string" ? children : ""}
      language={/language-(\S+)/.exec(className ?? "")?.[1] ?? ""}
    />
  )
}

const components = { code: MarkdownCode }

export type MarkdownProps = {
  children: string
  /** 응답이 스트리밍 중이면 true. 미완성 마크다운과 코드 펜스를 처리한다. */
  streaming?: boolean
  className?: string
}

export function Markdown({ children, streaming = false, className }: MarkdownProps) {
  return (
    <Streamdown
      className={className}
      controls={false}
      components={components}
      isAnimating={streaming}
    >
      {children}
    </Streamdown>
  )
}
