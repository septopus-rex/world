import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@core/components/ErrorBoundary'
import UpdateNotifier from './components/UpdateNotifier'

// DESKTOP shell entry. The MOBILE shell is its own app (client/mobile, port
// 7778) over the same shared core (client/core: loader/useEngine/components +
// the pure-data world) — specs/mobile-client.md. This entry stays desktop-only.
//
// The SPP粒子 (StylePack library) editor used to hang off a ?tool=stylepack
// branch here; it is its OWN app now (client/editor, port 7779) — spp-editors.md
// §3's "Editor 2 is independent of the world". Editor 1 (the 魔法球 source
// editor) deliberately stays IN the world app: placing cells is a spatial act.
//
// Surface unhandled async rejections on screen (helps debug the 3D canvas).
window.addEventListener('unhandledrejection', (e) => {
  const stack = (e.reason as any)?.stack || ''
  if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return
  console.error('[UnhandledRejection]', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateNotifier />
    </ErrorBoundary>
  </StrictMode>,
)
