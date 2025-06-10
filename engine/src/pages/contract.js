import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-wallets";

import { useState, useEffect, useMemo } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export const WalletConnectionProvider = ({ children }) => {
  const endpoint = clusterApiUrl("devnet");
  const wallets = useMemo(() => [
    new UnsafeBurnerWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default function Contract() {

    //let [ address, setAddress ] = useState("");

    const wallet = useWallet();

    useEffect(() => {
        if(wallet.publicKey!==null){
            setAddress(wallet.publicKey.toString());
        }
    }, [wallet]);

    return (
        <WalletConnectionProvider>
            <WalletMultiButton className="btn-md"></WalletMultiButton>
        </WalletConnectionProvider>
      )
}   