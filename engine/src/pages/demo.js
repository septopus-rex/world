
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useEffect, useMemo } from "react";
import World from "../septopus/app";

// import * as anchor from '@coral-xyz/anchor';
// import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";

// import IDL from "./luckysig.json";

export default function Demo() {

  let CONNECTION = null;
  const devnet = "https://winter-old-bridge.solana-devnet.quiknode.pro/982a105c0cf37e14d1977ecba41113f7ef2ea049";

  const self = {
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
    //connet to Solana node to run program
    init: async (ck) => {
      if (CONNECTION === null) CONNECTION = new Connection(devnet, 'confirmed');

      return ck && ck();
    },
    getContract: async (wallet, IDL) => {
      const provider = new anchor.AnchorProvider(CONNECTION, wallet, { commitment: 'confirmed' });
      console.log(IDL,provider);
      const caller = new anchor.Program(IDL, provider);
      return caller
    },
    getSlotHash: async (slot,ck)=>{
        self.init();
        try {
            const cfg={commitment: "confirmed",maxSupportedTransactionVersion:0};
            //console.log(CONNECTION.getBlock);
            const block = await CONNECTION.getBlock(slot, cfg);
            if (block && block.blockhash) {
                return ck && ck(block.blockhash);
            } else {
                return ck && ck({error:"Unconfirmed block."});
            }
        } catch (error) {
            //console.log(error);
            return ck && ck({error:"Failed to get block hash."});
        }
    },
  }
  const dom_id = "three_demo";

  useEffect(() => {
    const cfg = {
      contract: {
        mint: async (x, y, world) => {
          const hash = "2nD7acNeEbShKndVDcUU1yvwDGFvgaYGgGFhGMUpHnAP11tHQ2xsafcYdpvFZv19kFSWxih2WTkjo3L1L4Jyrsc3";
          return { signature: hash, action: "mint" };
        },
        update: async (json, x, y, world) => {
          const hash = "2XaBFF5DN5mXzStj8n1zLD45KoKKTM21BewFieD4FVp5ZsgaeB76yGFkKJ34omGarnTcoQY1HLSVD3bdPKmgR6vh";
          return { signature: hash, action: "update" };
        },
        sell: async (price, x, y, world) => {
          const hash = "4XtC1VGinbs9bHfnpfnsfrcTRR739AbVRBC86m3h5NUevUE7xsm6Fm6kZJF6J3gABE2K65UMAtbpAYcE6X1NTA77";
          return { signature: hash, action: "sell" };
        },
        buy: async (x, y, world) => {
          const hash = "4Ma4scvspiZ5RNHH3ejvJAJZRFF9Rz8Pe26ULieaNddYccVWqWJE2ASn8EZ24YStbPh1L8WtnoZB1JoBaLkFhkjv";
          return { signature: hash, action: "buy" };
        },
        withdraw: async (x, y, world) => {
          const hash = "5TU4xA5GU6HuHMVkVPivc83B88sKTFE7VeUjWmwWdzmYxb6BNBC4dicD9BY5fSdFU66UuaT77zPYpoo1f4DUZ6wZ";
          return { signature: hash, action: "withdraw" };
        },
      },
      fullscreen: true,
      shadow: true,
      actuator: {
        decode: (idl) => {
          //self.init();
          //self.getContract(useWallet, idl);
        },
        call: async (pid) => {

        },
      },
    };

    World.launch(dom_id, cfg, (done) => {
      console.log(`App loaded:`, done);
      self.getSlotHash(334567,(data)=>{
        console.log(data);
      });
    });
  }, []);

  const WalletConnectionProvider = ({ children }) => {
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

  return (
    <WalletConnectionProvider>
      <div id={dom_id} className={self.getRenderClass()}></div>
      {/* <WalletMultiButton className="btn-md"/> */}
    </WalletConnectionProvider>

  );
}
