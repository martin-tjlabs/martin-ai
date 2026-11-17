import { KeyRoundIcon } from "lucide-react"

import { Button } from "#components/ui/button"
import { TraceIcon, TraceLine, TraceTitle } from "#components/ui/trace"

import { openAuthWindow, type ToolAuthRequired as ToolAuthRequiredResult } from "../auth"

export type ToolAuthRequiredProps = {
  result: ToolAuthRequiredResult
}

// 도구가 인증을 요구할 때 보이는 줄. 버튼을 누르면 별도 창에서 로그인한다.
// 토큰은 서버가 받아 보관하므로, 이 화면은 로그인 URL만 다룬다.
export function ToolAuthRequired({ result }: ToolAuthRequiredProps) {
  const service = result.service ?? "서비스"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <TraceLine>
          <TraceIcon>
            <KeyRoundIcon />
          </TraceIcon>
          <TraceTitle>{service} 연결이 필요합니다</TraceTitle>
        </TraceLine>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openAuthWindow(result.authorizationUrl)}
        >
          {service} 연결
        </Button>
      </div>
    </div>
  )
}
