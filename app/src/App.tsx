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

      // Expose for verification/debugging
      (window as any).loader = loaderRef.current;
      (window as any).world = (loaderRef.current as any).world;

      // Expose the internal 'menu' API mapping
      setMenu(loaderRef.current.getSelectedMenu());
    }

  }, [wallet]);

  const selectAdjunct = (type: string) => {
    if (!loaderRef.current) return;
    if (type === 'box') loaderRef.current.selectBox();
    if (type === 'sphere') loaderRef.current.selectSphere();
    if (type === 'cone') loaderRef.current.selectCone();
    if (type === 'trigger') loaderRef.current.selectTrigger();
    if (type === 'wall') loaderRef.current.selectWall();
    if (type === 'water') loaderRef.current.selectWater();
    setMenu(loaderRef.current.getSelectedMenu());
  };

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
      <div className="w-80 shadow-lg bg-white p-4 rounded-xl flex flex-col gap-4 overflow-y-auto max-h-screen">
        <h2 className="text-xl font-bold border-b pb-2">Adjunct Editor</h2>

        {/* Selection Buttons */}
        <div className="flex flex-wrap gap-2">
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200" onClick={() => selectAdjunct('box')}>Box</button>
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200" onClick={() => selectAdjunct('sphere')}>Sphere</button>
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200" onClick={() => selectAdjunct('cone')}>Cone</button>
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-pink-100 text-pink-700 rounded hover:bg-pink-200" onClick={() => selectAdjunct('trigger')}>Trigger</button>
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200" onClick={() => selectAdjunct('wall')}>Wall</button>
          <button className="flex-1 min-w-[30%] py-1 px-2 text-xs bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200" onClick={() => selectAdjunct('water')}>Water</button>
        </div>

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
                          loaderRef.current.updateSelectedData(item.key, parseFloat(e.target.value));
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