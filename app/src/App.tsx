'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
  return (
    <div style={{ padding: 40 }}>
      <h1>🧬 Solana React dApp Starter</h1>
      <WalletMultiButton />
    </div>
  );
}

export default App;