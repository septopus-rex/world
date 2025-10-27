'use client';

import { useEffect } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { FaWallet } from 'react-icons/fa';
import World from "../septopus/app";

export default function Demo() {

  const self = {
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
  }
  const dom_id = "three_demo";
  const { publicKey } = useWallet();

  useEffect(() => {
    const cfg = {
      fullscreen: true,
      shadow: true,
    };

    World.launch(dom_id, cfg, (done) => {
      console.log(`App loaded:`, done);
    });
  }, []);

  return (
    <>
      <div id={dom_id} className={self.getRenderClass()}></div>
      <div style={{position:"fixed",top:"15px",right:"15px"}}>
        <WalletMultiButton className="wallet-icon-button">
          <FaWallet size={20} />
        </WalletMultiButton>
      </div>
    </>
  );
}
