import { DefaultChatTransport } from 'martin-ai'

// FLOW 웹 앱이 access token을 저장하는 localStorage 키.
// 실제 FLOW 앱의 키 이름(과 값 형식)에 맞춰 바꿔야 한다.
export const FLOW_TOKEN_STORAGE_KEY = 'access_token'

// localStorage는 출처(origin)마다 따로라서, 이 값은 FLOW 웹 앱과 같은 출처에서만 읽힌다.
function readFlowToken() {
  try {
    return localStorage.getItem(FLOW_TOKEN_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

// 요청할 때마다 localStorage를 다시 읽는다. FLOW 앱이 토큰을 갱신해도 최신 값이 간다.
// 토큰이 없으면 헤더를 보내지 않고, 서버는 FLOW 로그인 흐름으로 넘어간다.
export function createChatTransport(api = '/api/chat') {
  return new DefaultChatTransport({
    api,
    headers: (): Record<string, string> => {
      const token = readFlowToken()
      return token ? { 'X-Flow-Access-Token': token } : {}
    },
  })
}
