import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MobileApp from './MobileApp'
import ErrorBoundary from '@core/components/ErrorBoundary'

// Septopus MOBILE shell entry — standalone app (port 7778) over the shared
// client core + engine (specs/mobile-client.md). Desktop lives in client/desktop.
window.addEventListener('unhandledrejection', (e) => {
  const stack = (e.reason as any)?.stack || ''
  if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return
  console.error('[UnhandledRejection]', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MobileApp />
    </ErrorBoundary>
  </StrictMode>,
)
