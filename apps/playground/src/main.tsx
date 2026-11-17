import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'martin-ai/styles.css'
import './host.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
