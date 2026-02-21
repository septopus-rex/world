'use client';

import { useEffect, useState, useRef } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import SeptopusContract from "./lib/contract";
import { useWallet } from "@solana/wallet-adapter-react";
import { SandboxLoader } from './SandboxLoader';

function App() {
  const wallet = useWallet();
  const loaderRef = useRef<SandboxLoader | null>(null);
  const [menu, setMenu] = useState<any>(null);

  const self = {
    clickInit: (ev: any) => {
      const recipient = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      const root = "G5YzePkbR7istighPC2xSjmGQh6SyVB1YcwYc5jVmvGN";
      SeptopusContract.call("init", (data: any) => {
        console.log(data);
      }, [root, recipient]);
    },
    getRenderClass: () => {
      return "w-full h-[600px] border border-gray-300 rounded overflow-hidden";
    },
    setWallet: async () => {
      await SeptopusContract.set(wallet);
    },
  }

  useEffect(() => {
    self.setWallet();

    // Inject the ECS Sandbox Engine
    if (!loaderRef.current) {
      loaderRef.current = new SandboxLoader();
      loaderRef.current.init('three_demo');

      // Expose the internal 'menu' API mapping defined by the SPP basic_box.ts protocol
      setMenu(loaderRef.current.getBoxMenu());
    }

  }, [wallet]);

  return (
    <div className="p-10 flex gap-4 bg-gray-50 min-h-screen">
      {/* 3D Viewport */}
      <div className="flex-1 shadow-lg bg-white p-4 rounded-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">SPP Protocol Render Sandbox</h2>
          <div className="flex gap-2">
            <WalletMultiButton />
            <button className="px-4 py-2 bg-blue-600 text-white rounded font-medium" onClick={self.clickInit}>Initialize Legacy Contract</button>
          </div>
        </div>

        <div id="three_demo" className={self.getRenderClass()}></div>
      </div>

      {/* SPP Extracted Data UI Menu */}
      <div className="w-80 shadow-lg bg-white p-4 rounded-xl flex flex-col gap-4">
        <h2 className="text-xl font-bold border-b pb-2">Adjunct Editor</h2>
        {menu ? (
          <div className="flex flex-col gap-4">
            {/* Process dynamically generated UI groups from the adjunct 'menu' protocol */}
            {Object.keys(menu).map(category => (
              <div key={category} className="border p-2 rounded bg-gray-50">
                <h3 className="font-semibold text-gray-700 capitalize mb-2">{category}</h3>
                {menu[category].map((item: any) => (
                  <div key={item.key} className="flex justify-between items-center mb-1 text-sm text-gray-600 line-clamp-1">
                    <span>{item.label}</span>
                    <input
                      type={item.type}
                      className="border rounded w-20 px-1 py-1"
                      defaultValue={item.value}
                      onChange={(e) => {
                        if (loaderRef.current) {
                          loaderRef.current.updateBoxData(item.key, parseFloat(e.target.value));
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic text-sm">Waiting for ECS engine...</p>
        )}
      </div>
    </div>
  );
}

export default App;