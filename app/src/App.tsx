'use client';

import { useEffect, useRef } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// @ts-ignore
import SeptopusContract from "./lib/contract";
import { useWallet } from "@solana/wallet-adapter-react";
import { SandboxLoader } from './SandboxLoader';
import { useIsMobile } from './lib/useIsMobile';
import { Joystick } from './components/Joystick';

function App() {
  const wallet = useWallet();
  const loaderRef = useRef<SandboxLoader | null>(null);
  const isMobile = useIsMobile();

  // Refs for high-performance direct DOM manipulation to avoid React re-renders every 16ms
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const blockDisplayRef = useRef<HTMLSpanElement>(null);

  const self = {
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
    }
  }, [wallet]);

  // High performance HUD animation loop
  useEffect(() => {
    let animationId: number;

    const updateHUD = () => {
      if (loaderRef.current) {
        // Update Compass Needle (Engine returns Yaw in radians)
        if (compassNeedleRef.current) {
          const yawRad = loaderRef.current.getPlayerRotationY();
          // Engine Y rotation is mathematically opposite to CSS 2D rotation 
          // (ThreeJS CCW vs CSS CW depending on camera setup, usually multiply by -1)
          const degrees = (yawRad * 180) / Math.PI;
          compassNeedleRef.current.style.transform = `rotate(${-degrees}deg)`;
        }

        // Update Logical Block Coordinates
        if (blockDisplayRef.current) {
          const coords = loaderRef.current.currentBlockCoordinate;
          blockDisplayRef.current.innerText = `Block [${coords.x}, ${coords.y}] | ${coords.world}`;
        }
      }
      animationId = requestAnimationFrame(updateHUD);
    };

    animationId = requestAnimationFrame(updateHUD);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans touch-none"
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* 1. Underlying 3D Engine Canvas */}
      {/* Must use explicit ID 'three_demo' so SandboxLoader knows where to mount */}
      <div id="three_demo" className="absolute inset-0 z-0 w-full h-full"></div>

      {/* 2. Top Navigation / Status Overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-start pointer-events-none">

        {/* Left: Branding & Status */}
        <div className="pointer-events-auto bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl">
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 tracking-tight">
            Septopus World
          </h1>
          <p className="text-xs text-gray-300 mt-1 font-medium bg-black/30 px-2 py-1 rounded inline-block">
            {isMobile ? "Touch right screen to Look • Joystick to Move" : "Click screen to lock/unlock • WASD to Move"}
          </p>
          <div className="mt-2 text-sm font-mono text-green-400 drop-shadow-md">
            <span ref={blockDisplayRef}>Block [2026, 222] | main</span>
          </div>
        </div>

        {/* Right: Wallet & Compass */}
        <div className="flex flex-col gap-4 items-end pointer-events-auto">
          <WalletMultiButton style={{ backgroundColor: '#111827', border: '1px solid #374151' }} />

          {/* Compass Dashboard */}
          <div className="w-24 h-24 mt-2 bg-gray-900/60 backdrop-blur-xl border-2 border-white/20 rounded-full flex items-center justify-center relative shadow-2xl">
            {/* Compass markings */}
            <span className="absolute top-1 text-[10px] font-bold text-red-500">N</span>
            <span className="absolute bottom-1 text-[10px] font-bold text-gray-500">S</span>
            <span className="absolute right-2 text-[10px] font-bold text-gray-500">E</span>
            <span className="absolute left-2 text-[10px] font-bold text-gray-500">W</span>

            {/* The Rotating Needle */}
            <div
              ref={compassNeedleRef}
              className="w-1 h-14 relative transition-transform duration-75 ease-linear pointer-events-none origin-center"
            >
              <div className="absolute top-0 left-0 w-full h-1/2 bg-red-500 rounded-t-full"></div>
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-white rounded-b-full"></div>
            </div>

            {/* Center dot */}
            <div className="absolute w-2 h-2 bg-black rounded-full border border-white/50 z-10"></div>
          </div>
        </div>
      </div>

      {/* 4. Mobile Overlay Controls (Virtual Joystick & Action Buttons) */}
      {isMobile && (
        <>
          <div className="absolute bottom-8 left-8 z-20 pointer-events-none">
            <Joystick
              size={130}
              onMove={(data) => {
                loaderRef.current?.setPlayerMoveIntent(data.x, data.y);
              }}
              onStop={() => {
                loaderRef.current?.setPlayerMoveIntent(0, 0);
              }}
            />
          </div>

          <div className="absolute bottom-8 right-8 z-20 pointer-events-auto">
            <button
              className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border-2 border-white/30 backdrop-blur-md flex items-center justify-center active:scale-95 transition-all shadow-xl"
              onTouchStart={(e) => {
                e.preventDefault(); // Prevent pointer lock/scroll
                loaderRef.current?.triggerPlayerJump();
              }}
            >
              <span className="font-extrabold text-white text-xs tracking-widest opacity-90">JUMP</span>
            </button>
          </div>
        </>
      )}

    </div>
  );
}

export default App;