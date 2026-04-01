import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WalletContextProvider } from './components/WalletContextProvider';
import '@solana/wallet-adapter-react-ui/styles.css';
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </StrictMode>,
)