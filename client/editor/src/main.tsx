import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import StylePackEditor from './StylePackEditor'
import ErrorBoundary from '@core/components/ErrorBoundary'

// EDITOR shell entry — the standalone SPP粒子 (StylePack) editor, its own app on
// port 7779. It used to be a `?tool=stylepack` branch inside the desktop shell;
// split out 2026-08-05 because the library editor is a growing tool with its own
// roadmap (2D face-grid editing, contract guards, CID freezing — spp-editors.md
// §3/§6) and no reason to ride in the player bundle.
//
// The editor's whole UI is StylePackEditor: there is no route table, because
// "编一个粒子库" is the only thing this app does.
window.addEventListener('unhandledrejection', (e) => {
  const stack = (e.reason as any)?.stack || ''
  if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return
  console.error('[UnhandledRejection]', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StylePackEditor />
    </ErrorBoundary>
  </StrictMode>,
)
