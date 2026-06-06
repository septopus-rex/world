import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import UpdateNotifier from './components/UpdateNotifier'

// Surface unhandled async rejections on screen (helps debug the 3D canvas on mobile).
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
