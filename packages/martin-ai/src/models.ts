import * as React from "react"

/** 서버가 허용한 모델 하나. id는 "회사:모델명" 형식이다. */
export type ChatModel = {
  id: string
  provider: string
  name: string
}

/** 사고 수준(effort). 높을수록 더 깊게 생각하고 토큰을 더 쓴다. */
export type ChatEffort = "low" | "medium" | "high" | "xhigh" | "max"

/** GET /api/models 응답 */
export type ChatModelsResponse = {
  models: ChatModel[]
  defaultModel: string | null
  /** 고를 수 있는 사고 수준. 서버가 정하며, 대본 모드에서는 빈 배열 */
  efforts?: ChatEffort[]
}

export type UseChatModelsResult = {
  /** 고를 수 있는 모델. 아직 불러오지 못했거나 대본 모드이면 빈 배열 */
  models: ChatModel[]
  /** 지금 고른 모델 ID. 목록이 비어 있으면 undefined */
  model: string | undefined
  setModel: (id: string) => void
  /** 고를 수 있는 사고 수준 */
  efforts: ChatEffort[]
  /** 지금 고른 사고 수준. undefined이면 모델 기본값을 쓴다 */
  effort: ChatEffort | undefined
  setEffort: (effort: ChatEffort | undefined) => void
  /** sendMessage의 body로 넘길 값. 고른 모델과 사고 수준만 담는다 */
  body: { model?: string; effort?: ChatEffort } | undefined
}

// 모델 목록 엔드포인트에서 허용 모델을 읽고, 고른 모델을 상태로 들고 있는다.
// 불러오기에 실패하면 목록을 비워 두어 서버의 기본 모델로 대화하게 한다.
export function useChatModels(api = "/api/models"): UseChatModelsResult {
  const [data, setData] = React.useState<ChatModelsResponse>({
    models: [],
    defaultModel: null,
  })
  const [selected, setSelected] = React.useState<string>()
  const [selectedEffort, setSelectedEffort] = React.useState<ChatEffort>()

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

  const efforts = data.efforts ?? []
  const effort =
    selectedEffort && efforts.includes(selectedEffort) ? selectedEffort : undefined

  const body =
    model || effort
      ? { ...(model ? { model } : {}), ...(effort ? { effort } : {}) }
      : undefined

  return {
    models: data.models,
    model,
    setModel: setSelected,
    efforts,
    effort,
    setEffort: setSelectedEffort,
    body,
  }
}
