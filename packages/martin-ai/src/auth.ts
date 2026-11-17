import * as React from "react"

// 도구가 "인증이 필요하다"고 알릴 때 쓰는 결과 형식. 서버의 connectFlow 같은 도구가 돌려준다.
export type ToolAuthRequired = {
  status: "auth-required"
  service?: string
  authorizationUrl: string
  message?: string
  /** 로그인이 필요해진 이유(예: 브라우저의 토큰이 거절됨). 있으면 버튼 아래에 보인다 */
  detail?: string
}

export function isToolAuthRequired(value: unknown): value is ToolAuthRequired {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "auth-required" &&
    typeof (value as { authorizationUrl?: unknown }).authorizationUrl === "string"
  )
}

// 사용자가 채팅으로 연결 해제를 요청했을 때 도구가 돌려주는 결과. 화면은 이것을 해제 버튼으로 보인다.
// 도구 자체는 아무것도 해제하지 않으며, 사람이 버튼을 눌러야 disconnectApi가 불린다.
export type ToolDisconnectRequested = {
  status: "disconnect-requested"
  service?: string
  disconnectApi?: string
  message?: string
}

export function isToolDisconnectRequested(
  value: unknown
): value is ToolDisconnectRequested {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "disconnect-requested"
  )
}

// 로그인 창(콜백 페이지)이 같은 출처로 보내는 채널. Google 로그인을 거치면
// window.opener가 끊길 수 있어 postMessage 대신 BroadcastChannel을 쓴다.
export const AUTH_CHANNEL = "martin-ai-auth"

export type AuthCompleteEvent = {
  type: "martin-ai:auth"
  /** connected: 로그인 성공, failed: 로그인 실패, disconnected: 연결 해제 */
  status: "connected" | "failed" | "disconnected"
  /** 연결한 서비스 이름. 예: "FLOW" */
  service?: string
  /** 연결에 성공했을 때 서버가 받은 access token. 저장 여부와 위치는 호스트가 정한다 */
  accessToken?: string
  /** access token의 유효 시간(초) */
  expiresIn?: number
}

// 별도 창으로 로그인 페이지를 연다. 팝업이 막히면 새 탭으로 연다.
export function openAuthWindow(url: string) {
  const popup = window.open(
    url,
    "martin-ai-auth",
    "popup,width=480,height=680"
  )
  if (!popup) {
    window.open(url, "_blank", "noopener")
  }
}

export type DisconnectToolOptions = {
  /** 연결 해제 엔드포인트. 기본값은 "/api/mcp/disconnect" */
  api?: string
  /** 해제하는 서비스 이름. 다른 탭에 알릴 때 쓴다. 예: "FLOW" */
  service?: string
  /** 요청에 붙일 헤더. 브라우저에 저장한 토큰도 폐기하려면 여기에 싣는다 */
  headers?: Record<string, string>
}

export type DisconnectToolResult = {
  /** 인증 서버에서 폐기한 토큰 종류 */
  revoked: string[]
  /** 폐기하지 못한 토큰과 이유. 서버 메모리에서는 지워졌지만 만료 시각까지 유효할 수 있다 */
  notRevoked: Array<{ token: string; reason: string }>
}

// 서버에 연결 해제를 요청한다. 서버는 토큰을 폐기하고 세션에서 지운다.
// 끝나면 같은 출처의 다른 탭과 화면에 "disconnected"를 알린다. 브라우저 저장소는 호스트가 지운다.
export async function disconnectTool({
  api = "/api/mcp/disconnect",
  service,
  headers,
}: DisconnectToolOptions = {}): Promise<DisconnectToolResult> {
  const response = await fetch(api, { method: "POST", headers })
  if (!response.ok) {
    throw new Error(`연결 해제에 실패했습니다. (HTTP ${response.status})`)
  }
  const result = (await response.json()) as DisconnectToolResult

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_CHANNEL)
    channel.postMessage({
      type: "martin-ai:auth",
      status: "disconnected",
      service,
    } satisfies AuthCompleteEvent)
    channel.close()
  }
  return result
}

// 로그인 창이 결과를 알리면 onComplete를 부른다. 연결 해제 알림("disconnected")도 받는다.
export function useAuthComplete(onComplete: (event: AuthCompleteEvent) => void) {
  const callback = React.useRef(onComplete)
  React.useEffect(() => {
    callback.current = onComplete
  })

  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return
    }
    const channel = new BroadcastChannel(AUTH_CHANNEL)
    channel.onmessage = (event: MessageEvent<AuthCompleteEvent>) => {
      if (event.data?.type === "martin-ai:auth") {
        callback.current(event.data)
      }
    }
    return () => channel.close()
  }, [])
}
