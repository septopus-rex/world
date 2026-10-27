import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ChainSystemApp from './ChainSystemApp'
import ErrorBoundary from '@core/components/ErrorBoundary'

// Septopus UNIFIED CHAIN LOADER entry (protocol/cn|en/boot-chain.md §3).
// Packed into a single self-contained IIFE (`dist-chain/app.js` + `style.css`)
// and seeded into IPFS CAS as `septopus.loader` (`anchor:septopus`).
// Boots the full system (Mobile 3D + Desktop 3D + SPP 粒子工坊 + Solana Land
// Registry & Marketplace) from a single loader document.
window.addEventListener('unhandledrejection', (e) => {
  const stack = (e.reason as any)?.stack || ''
  if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return
  console.error('[UnhandledRejection]', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ChainSystemApp />
    </ErrorBoundary>
  </StrictMode>,
)
