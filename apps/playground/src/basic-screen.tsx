import { Chat } from 'martin-ai'

// 기본형: <Chat /> 한 줄
export function BasicScreen() {
  return (
    <div className="host-basic">
      <Chat api="/api/chat" />
    </div>
  )
}
