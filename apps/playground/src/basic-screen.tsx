import { Chat } from 'martin-ai'

import { createChatTransport } from './flow-token.ts'

// FLOW 웹 앱에 이미 로그인해 있으면 그 토큰을 헤더로 실어 보내는 transport
const transport = createChatTransport()

// 기본형: <Chat /> 한 줄
export function BasicScreen() {
  return (
    <div className="host-basic">
      <Chat transport={transport} />
    </div>
  )
}
