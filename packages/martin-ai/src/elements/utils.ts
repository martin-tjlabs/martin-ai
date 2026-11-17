import { isTextUIPart, type UIMessage } from "ai"

// 메시지의 텍스트 파트를 이어 붙인다. 단계가 나뉘어 들어온 텍스트는 문단으로 구분한다.
export function getMessageText(message: UIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n")
}
