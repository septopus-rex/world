'use client';

import { useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
//import World from './septopus/app';
import SeptopusContract from "./lib/contract";
import { useWallet } from "@solana/wallet-adapter-react";

function App() {
  const wallet = useWallet();

  const self = {
    clickInit: (ev:any) => {
      const recipient = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      const root = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      SeptopusContract.call("init", (data:any) => {
        console.log(data);
      }, [root, recipient]);
    },
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
    setWallet: async () => {
      //console.log(wallet);
      await SeptopusContract.set(wallet);
    },
  }

  useEffect(() => {
    // if (wallet.publicKey !== null) {
    //   setAddress(wallet.publicKey.toString());
    // }

    // const cfg = {

    // };
    // World.launch("three_demo", cfg, (done:any) => {
    //   console.log(`App loaded:`, done);
    // });
    self.setWallet();

  }, [wallet]);
  return (
    <div style={{ padding: 40 }}>
      <WalletMultiButton />
      <div id="three_demo" className={self.getRenderClass()} style={{ height: "600px" }}></div>
      <button onClick={(ev)=>{
        self.clickInit(ev);
      }}>Init</button>
    </div>
  );
}

export default App;