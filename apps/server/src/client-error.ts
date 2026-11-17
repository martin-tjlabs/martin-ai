import { APICallError, RetryError } from "ai"

// 클라이언트에 보낼 오류 문구. 원인 자체(응답 본문, 키, 요청 내용)는 서버 로그에만 남기고,
// 사용자가 할 수 있는 일이 달라지는 원인 종류만 짧게 알린다. 그 밖에는 일반 문구를 보낸다.
export function toClientErrorMessage(error: unknown): string {
  // 재시도 끝에 실패하면 RetryError가 마지막 오류를 감싼다
  const cause = RetryError.isInstance(error) ? error.lastError : error
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return "모델 사용 한도를 넘었습니다. 다른 모델을 고르거나 잠시 후 다시 시도해 주세요."
    }
    // 503: 일시적인 수요 과다, 529: Anthropic 과부하
    if (cause.statusCode === 503 || cause.statusCode === 529) {
      return "모델이 일시적으로 혼잡합니다. 잠시 후 다시 시도하거나 다른 모델을 골라 주세요."
    }
  }
  return "An error occurred."
}
