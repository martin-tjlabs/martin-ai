import { useState } from 'react'

import { AssembledScreen } from './assembled-screen.tsx'
import { BasicScreen } from './basic-screen.tsx'

const TABS = [
  { id: 'basic', label: '기본형' },
  { id: 'assembled', label: '조립형' },
] as const

type TabId = (typeof TABS)[number]['id']

function App() {
  const [tab, setTab] = useState<TabId>('basic')

  return (
    <div className="host">
      <header className="host-header">
        <h1>Playground</h1>
        <nav className="host-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="host-main">
        {tab === 'basic' ? <BasicScreen /> : <AssembledScreen />}
      </main>
    </div>
  )
}

export default App
