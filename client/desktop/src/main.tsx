import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import StylePackEditor from './stylepack-editor/StylePackEditor'
import ErrorBoundary from '@core/components/ErrorBoundary'
import UpdateNotifier from './components/UpdateNotifier'

// DESKTOP shell entry. The MOBILE shell is its own app (client/mobile, port
// 7778) over the same shared core (client/core: loader/useEngine/components +
// the pure-data world) — specs/mobile-client.md. This entry stays desktop-only.
//
// ?tool=stylepack → the standalone SPP粒子 (option library) editor, independent
// of the world app (its own lean Engine harness for preview). spp-editors.md §3.
const tool = new URLSearchParams(window.location.search).get('tool')

// Surface unhandled async rejections on screen (helps debug the 3D canvas).
window.addEventListener('unhandledrejection', (e) => {
  const stack = (e.reason as any)?.stack || ''
  if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return
  console.error('[UnhandledRejection]', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {tool === 'stylepack' ? <StylePackEditor /> : <App />}
      <UpdateNotifier />
    </ErrorBoundary>
  </StrictMode>,
)
