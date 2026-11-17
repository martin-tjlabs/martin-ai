import { DefaultChatTransport, type AuthCompleteEvent } from 'martin-ai'

// FLOW MCP용 access token을 저장하는 localStorage 키.
// FLOW 로그인(Sign in with Google)으로 서버가 받은 토큰을 여기에 저장하고, 요청마다 헤더로 보낸다.
// FLOW 웹 앱의 'access_token'과 키를 나눠 서로의 토큰을 덮어쓰지 않게 한다.
export const FLOW_TOKEN_STORAGE_KEY = 'flow_mcp_access_token'

// localStorage는 출처(origin)마다 따로라서, 저장한 출처의 화면에서만 읽힌다.
function readFlowToken() {
  try {
    return localStorage.getItem(FLOW_TOKEN_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

// FLOW 연결 알림에 맞춰 저장소를 맞춘다.
// - connected: 로그인 창이 알려 준 토큰을 저장한다
// - disconnected: 채팅 안의 "FLOW 연결 해제" 버튼으로 해제했으면 저장값을 지운다
// 실패 알림이거나 FLOW가 아닌 서비스의 알림은 무시한다.
export function syncFlowToken(event: AuthCompleteEvent) {
  if (event.service !== 'FLOW') return
  try {
    if (event.status === 'connected' && event.accessToken) {
      localStorage.setItem(FLOW_TOKEN_STORAGE_KEY, event.accessToken)
    } else if (event.status === 'disconnected') {
      localStorage.removeItem(FLOW_TOKEN_STORAGE_KEY)
    }
  } catch {
    // 저장소를 쓸 수 없으면(시크릿 창 제한 등) 서버 세션의 토큰만 쓴다
  }
}

// 요청할 때마다 localStorage를 다시 읽는다. 다시 로그인해 토큰이 바뀌어도 최신 값이 간다.
// 토큰이 없거나 만료되어 거절되면, 서버는 세션의 토큰을 쓰거나 FLOW 로그인 흐름으로 넘어간다.
export function createChatTransport(api = '/api/chat') {
  return new DefaultChatTransport({
    api,
    headers: (): Record<string, string> => {
      const token = readFlowToken()
      return token ? { 'X-Flow-Access-Token': token } : {}
    },
  })
}
