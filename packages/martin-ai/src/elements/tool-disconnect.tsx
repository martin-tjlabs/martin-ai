import * as React from "react"
import { UnplugIcon } from "lucide-react"

import { Button } from "#components/ui/button"
import { TraceIcon, TraceLine, TraceTitle } from "#components/ui/trace"

import {
  disconnectTool,
  type ToolDisconnectRequested as ToolDisconnectRequestedResult,
} from "../auth"

export type ToolDisconnectRequestedProps = {
  result: ToolDisconnectRequestedResult
}

type Status = "idle" | "working" | "done" | "partial" | "error"

// 채팅으로 연결 해제를 요청받았을 때 보이는 줄. 사람이 버튼을 눌러야 해제된다.
// 해제가 끝나면 disconnectTool이 "disconnected"를 알리고, 호스트가 브라우저 저장값을 지운다.
export function ToolDisconnectRequested({ result }: ToolDisconnectRequestedProps) {
  const service = result.service ?? "서비스"
  const [status, setStatus] = React.useState<Status>("idle")

  async function onClick() {
    setStatus("working")
    try {
      const response = await disconnectTool({
        api: result.disconnectApi,
        service: result.service,
      })
      setStatus(response.notRevoked.length > 0 ? "partial" : "done")
    } catch {
      setStatus("error")
    }
  }

  const finished = status === "done" || status === "partial"
  const message = {
    idle: "",
    working: "해제하는 중…",
    done: `${service} 연결을 해제했습니다.`,
    partial: `${service} 연결을 해제했습니다. 일부 토큰은 폐기하지 못해 만료 시각까지 유효합니다.`,
    error: "연결 해제 요청이 실패했습니다. 다시 시도해 주세요.",
  }[status]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <TraceLine>
          <TraceIcon>
            <UnplugIcon />
          </TraceIcon>
          <TraceTitle>{service} 연결 해제</TraceTitle>
        </TraceLine>
        {!finished && (
          <Button
            size="sm"
            variant="outline"
            onClick={onClick}
            aria-disabled={status === "working"}
          >
            {service} 연결 해제
          </Button>
        )}
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
