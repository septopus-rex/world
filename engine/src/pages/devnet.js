'use client';

import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import World from "../septopus/app";
import SeptopusContract from "../lib/contract";

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

  useEffect(() => {
    const cfg = {};
    World.launch("three_demo", cfg, (done) => {
      console.log(`App loaded:`, done);
    });

    if (wallet.publicKey) {
      self.setWallet();
    }
  }, [wallet.publicKey]);

  const cmap = {
    position: "absolute",
    top: "34rem",
    left: "1rem",
    margin: "auto",
    width: "18rem",
    zIndex: 999999,
  }

  return (
    <>
      <div style={cmap}>
        <WalletMultiButton className="btn-md" ></WalletMultiButton>
      </div>
      <div id="three_demo" className={self.getRenderClass()} style={{ height: "600px" }}></div>
      <button className="btn btn-md" onClick={(ev) => {
        self.clickInit(ev);
      }}>Init</button>
    </>
  )
}   