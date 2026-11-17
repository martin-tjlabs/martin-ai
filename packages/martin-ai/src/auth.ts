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

// 로그인 창(콜백 페이지)이 같은 출처로 보내는 채널. Google 로그인을 거치면
// window.opener가 끊길 수 있어 postMessage 대신 BroadcastChannel을 쓴다.
export const AUTH_CHANNEL = "martin-ai-auth"

export type AuthCompleteEvent = {
  type: "martin-ai:auth"
  status: "connected" | "failed"
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

// 로그인 창이 결과를 알리면 onComplete를 부른다.
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
