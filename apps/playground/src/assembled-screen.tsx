import { useMemo } from 'react'
import {
  DefaultChatTransport,
  useAuthComplete,
  useChat,
  useChatModels,
} from 'martin-ai'
import {
  Button,
  ChatError,
  ChatThread,
  EffortSelector,
  ModelSelector,
  PromptInput,
} from 'martin-ai/elements'

// 조립형: martin-ai/elements의 조각과 useChat, useChatModels로 만든 좁은 사이드 패널
export function AssembledScreen() {
  return (
    <div className="host-assembled">
      <article className="host-article">
        <h2>호스트 본문</h2>
        <p>
          이 영역은 호스트 앱이 직접 그리는 화면입니다. 오른쪽 패널은{' '}
          <code>martin-ai/elements</code>의 조각을 조립해 만든 채팅입니다.
        </p>
        <ul>
          <li>기본형과 같은 엔드포인트(/api/chat)를 씁니다.</li>
          <li>헤더와 지우기 버튼은 호스트가 정한 레이아웃입니다.</li>
          <li>목록 기호와 글꼴이 바뀌었는지 보면 패키지 CSS의 영향을 알 수 있습니다.</li>
        </ul>
      </article>
      <aside className="host-panel">
        <SidePanelChat />
      </aside>
    </div>
  )
}

function SidePanelChat() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat' }),
    [],
  )
  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    setMessages,
    clearError,
  } = useChat({ transport })
  const { models, model, setModel, efforts, effort, setEffort, body } =
    useChatModels('/api/models')
  const busy = status === 'submitted' || status === 'streaming'

  // FLOW 연결을 별도 창에서 마치면 마지막 답변을 다시 받는다
  useAuthComplete((event) => {
    if (event.status === 'connected' && !busy && messages.at(-1)?.role === 'assistant') {
      void regenerate(body ? { body } : undefined)
    }
  })

  // 호스트에는 Tailwind가 없으므로 레이아웃은 host.css의 클래스로 잡는다.
  // martin-ai/styles.css에는 패키지 소스에 쓰인 유틸리티만 들어 있다.
  return (
    <div className="panel-chat">
      <div className="panel-chat-header">
        <div>
          <div className="panel-chat-title">도우미</div>
          <div className="panel-chat-subtitle">조립형 사이드 패널</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || messages.length === 0}
          onClick={() => {
            setMessages([])
            clearError()
          }}
        >
          지우기
        </Button>
      </div>
      <ChatThread
        messages={messages}
        status={status}
        className="panel-chat-thread"
        contentClassName="panel-chat-thread-content"
        empty="오른쪽 패널에서도 같은 대화를 할 수 있습니다."
      />
      <div className="panel-chat-footer">
        <ChatError error={error} />
        <PromptInput
          status={status}
          placeholder="질문을 입력하세요"
          onSubmit={(text) =>
            void sendMessage({ text }, body ? { body } : undefined)
          }
          onStop={() => void stop()}
          actions={
            <>
              <ModelSelector
                models={models}
                value={model}
                onValueChange={setModel}
              />
              <EffortSelector
                efforts={efforts}
                value={effort}
                onValueChange={setEffort}
              />
            </>
          }
        />
      </div>
    </div>
  )
}
