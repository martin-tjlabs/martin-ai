import * as React from "react"

/** 서버가 허용한 모델 하나. id는 "회사:모델명" 형식이다. */
export type ChatModel = {
  id: string
  provider: string
  name: string
}

/** GET /api/models 응답 */
export type ChatModelsResponse = {
  models: ChatModel[]
  defaultModel: string | null
}

export type UseChatModelsResult = {
  /** 고를 수 있는 모델. 아직 불러오지 못했거나 대본 모드이면 빈 배열 */
  models: ChatModel[]
  /** 지금 고른 모델 ID. 목록이 비어 있으면 undefined */
  model: string | undefined
  setModel: (id: string) => void
}

// 모델 목록 엔드포인트에서 허용 모델을 읽고, 고른 모델을 상태로 들고 있는다.
// 불러오기에 실패하면 목록을 비워 두어 서버의 기본 모델로 대화하게 한다.
export function useChatModels(api = "/api/models"): UseChatModelsResult {
  const [data, setData] = React.useState<ChatModelsResponse>({
    models: [],
    defaultModel: null,
  })
  const [selected, setSelected] = React.useState<string>()

  React.useEffect(() => {
    let cancelled = false

    fetch(api)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        return response.json() as Promise<ChatModelsResponse>
      })
      .then((next) => {
        if (!cancelled) {
          setData(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData({ models: [], defaultModel: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [api])

  const model =
    selected && data.models.some((item) => item.id === selected)
      ? selected
      : (data.defaultModel ?? undefined)

  return { models: data.models, model, setModel: setSelected }
}
