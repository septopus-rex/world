'use client';

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { UnsafeBurnerWalletAdapter, PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

import { useState, useEffect, useMemo } from "react";
import World from "../septopus/app";
import SeptopusContract from "../lib/contract";

export const WalletConnectionProvider = ({ children }) => {

  const endpoint = clusterApiUrl('devnet');

  const wallets = useMemo(
    () => [
      //new PhantomWalletAdapter(),
      //new BackpackWalletAdapter(),
      new UnsafeBurnerWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default function Contract() {
  const wallet = useWallet();

  const self = {
    clickInit: (ev) => {
      const recipient = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      const root = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      SeptopusContract.call("init", (data) => {
        console.log(data);
      }, [root, recipient]);
    },
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
    setWallet: async () => {
      await SeptopusContract.set(wallet);
    },
  }

  useEffect(async () => {
    if (wallet.publicKey !== null) {
      setAddress(wallet.publicKey.toString());
    }

    const cfg = {

    };
    World.launch("three_demo", cfg, (done) => {
      console.log(`App loaded:`, done);
    });

    self.setWallet();


  }, [wallet]);

  const cmap = {
    position: "absolute",
    top: "34rem",
    left: "1rem",
    margin: "auto",
    width: "18rem",
    zIndex: 999999,
  }

  return (
    <WalletConnectionProvider>
      <div style={cmap}>
        <WalletMultiButton className="btn-md" ></WalletMultiButton>
      </div>
      <div id="three_demo" className={self.getRenderClass()} style={{ height: "600px" }}></div>
      <button className="btn btn-md" onClick={(ev) => {
        self.clickInit(ev);
      }}>Init</button>
    </WalletConnectionProvider>
  )
}   