'use client';

import { useEffect, useRef, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// @ts-ignore
import SeptopusContract from "./lib/contract";
import { useWallet } from "@solana/wallet-adapter-react";
import { SandboxLoader } from './SandboxLoader';
import { Coords } from '../../engine/src/core/utils/Coords';
import { useIsMobile } from './lib/useIsMobile';
import { Joystick } from './components/Joystick';

function App() {
  const wallet = useWallet();
  const loaderRef = useRef<SandboxLoader | null>(null);
  const isMobile = useIsMobile();
  const [showMinimap, setShowMinimap] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  // Minimap Drag State
  const isDraggingMap = useRef(false);
  const lastMapPos = useRef({ x: 0, y: 0 });

  // Refs for high-performance direct DOM manipulation to avoid React re-renders every 16ms
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const blockDisplayRef = useRef<HTMLSpanElement>(null);
  const compassBlockDisplayRef = useRef<HTMLDivElement>(null);
  const minimapBlockDisplayRef = useRef<HTMLSpanElement>(null);

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

      // Inject standard UI components (Bridge between React state and Engine)
      const uiProvider = {
        show: (type: string, content: any) => {
          if (type === "toast") console.log("[HUD Toast]", content);
          if (type === "dialog") console.log("[HUD Dialog]", content);
        },
        hide: (type: string) => console.log("[HUD Hide]", type)
      };

      loaderRef.current.init('three_demo', uiProvider);

      // Expose for verification/debugging
      (window as any).loader = loaderRef.current;
      (window as any).world = loaderRef.current.engine?.getWorld();
    }
  }, [wallet]);

  // Sync React Minimap state -> Engine State
  useEffect(() => {
    if (loaderRef.current) {
      loaderRef.current.toggleMinimap(showMinimap);
    }
  }, [showMinimap]);

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
        if (blockDisplayRef.current || compassBlockDisplayRef.current || minimapBlockDisplayRef.current) {
          const state = loaderRef.current.playerState;
          const [bx, by] = state.block;
          const [rx, ry, rz] = state.position;
          const blockCount = loaderRef.current.getLoadedBlockCount();

          const text = `BLOCK [${bx}, ${by}]`;
          const subText = `REL X:${rx.toFixed(1)} Y:${ry.toFixed(1)} Z:${rz.toFixed(1)}`;

          // Calculate Absolute World Coordinates (Global)
          const blockSize = Coords.BLOCK_SIZE;
          const gx = (bx - 1) * blockSize + rx;
          const gy = (by - 1) * blockSize + ry;
          const worldText = `WORLD X:${gx.toFixed(1)} Y:${gy.toFixed(1)}`;

          if (compassBlockDisplayRef.current) {
            compassBlockDisplayRef.current.innerHTML = `
              <span class="text-[8px] text-cyan-500/50 font-bold uppercase tracking-[0.2em]">Live Telemetry</span>
              <div class="flex flex-col items-center -space-y-0.5">
                <span class="text-[13px] text-cyan-300 font-black tracking-wide">${text}</span>
                <span class="text-[11px] text-white font-bold font-mono tracking-tight">${worldText}</span>
                <span class="text-[10px] text-cyan-400/90 font-mono font-medium">${subText}</span>
              </div>
            `;
          }
          if (minimapBlockDisplayRef.current) minimapBlockDisplayRef.current.innerText = `${text} | world: ${state.world}`;
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
      <div
        id="three_demo"
        className="absolute inset-0 z-0 w-full h-full"
      ></div>

      {/* 2. Top Navigation / Status Overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-start pointer-events-none">

        {/* Left: Empty (Branding removed) */}
        <div></div>

        {/* Right: Wallet & Compass */}
        <div className="flex flex-col gap-4 items-end pointer-events-auto">
          <WalletMultiButton style={{ backgroundColor: '#111827', border: '1px solid #374151' }} />

          {/* Updated Compass Dashboard */}
          {/* Updated Compass Dashboard with Outer Arc */}
          <div className="relative group mt-6 flex items-center justify-center w-32 h-32">
            {/* Outer Decorative Arc/Ring */}
            <div className="absolute inset-2 rounded-full border border-white/10 border-dashed pointer-events-none"></div>

            {/* Outside Compass markings (Aligned to the Arc) */}
            <span className="absolute top-0 text-[10px] font-bold text-red-500/80 tracking-tighter shadow-sm">N</span>
            <span className="absolute bottom-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">S</span>
            <span className="absolute right-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">E</span>
            <span className="absolute left-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">W</span>

            <div
              className="w-24 h-24 bg-gray-900/60 backdrop-blur-xl border-2 border-white/20 rounded-full flex items-center justify-center relative shadow-2xl transition-transform cursor-default"
            >
              {/* Internal Rotating Container (View Cone & Direction Indicator) */}
              <div
                ref={compassNeedleRef}
                className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-linear pointer-events-none"
              >
                {/* Small Direction Triangle (at the inner rim) */}
                <div
                  className="absolute top-1 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] border-b-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.8)]"
                ></div>

                {/* Shrunken View Cone (Pizza Slice / Sector shape) */}
                <div
                  className="absolute w-24 h-24 rounded-full bg-cyan-400/10"
                  style={{
                    clipPath: 'polygon(50% 50%, 20% 0%, 80% 0%)',
                    transform: 'translateY(0%)'
                  }}
                ></div>
              </div>



              {/* Center dot */}
              <div className="absolute w-1.5 h-1.5 bg-black rounded-full border border-white/50 z-10 shadow-lg"></div>
            </div>
          </div>

          {/* Compass Coordinate Readout - NOW THE TOGGLE FOR MINIMAP */}
          <div
            onClick={() => setShowMinimap(!showMinimap)}
            ref={compassBlockDisplayRef}
            className="text-[10px] font-mono font-bold text-cyan-300 bg-black/60 border border-cyan-400/40 backdrop-blur-xl px-6 py-4 rounded-2xl mt-4 shadow-2xl cursor-pointer hover:border-cyan-400 transition-all text-center flex flex-col items-center gap-2 group min-w-[170px]"
          >
            {/* Initial placeholder content, will be overwritten by updateHUD */}
            <span className="text-[8px] text-cyan-500/50 font-bold uppercase tracking-[0.2em]">Live Telemetry</span>
            <span className="text-[13px] font-black tracking-wide">BLOCK [----, ----]</span>
            <span className="text-[11px] text-white font-bold">WORLD X:0.0 Y:0.0</span>
            <span className="text-[10px] text-cyan-400/90">REL X:0.0 Y:0.0 Z:0.0</span>
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

      {/* 5. Minimap Full Screen Backdrop */}
      {showMinimap && (
        <div
          className="absolute inset-0 z-30 pointer-events-auto bg-black/80 flex flex-col items-center justify-center"
          onWheel={(e) => {
            loaderRef.current?.applyMinimapZoom(e.deltaY > 0 ? -0.1 : 0.1);
          }}
          onMouseDown={(e) => {
            isDraggingMap.current = true;
            lastMapPos.current = { x: e.clientX, y: e.clientY };
            setIsFollowing(false);
          }}
          onMouseMove={(e) => {
            if (isDraggingMap.current) {
              const dx = e.clientX - lastMapPos.current.x;
              const dy = e.clientY - lastMapPos.current.y;
              lastMapPos.current = { x: e.clientX, y: e.clientY };
              loaderRef.current?.panMinimap(-dx, -dy);
            }
          }}
          onMouseUp={() => {
            isDraggingMap.current = false;
          }}
          onClick={(e) => {
            if (Math.abs(e.clientX - lastMapPos.current.x) < 5 && Math.abs(e.clientY - lastMapPos.current.y) < 5) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const mapSize = Math.min(600, rect.width * 0.9, rect.height * 0.9);
              const mapX = (rect.width - mapSize) / 2;
              const mapY = (rect.height - mapSize) / 2;
              const localX = e.clientX - mapX;
              const localY = e.clientY - mapY;
              if (localX >= 0 && localX <= mapSize && localY >= 0 && localY <= mapSize) {
                const ndcX = (localX / mapSize) * 2 - 1;
                const ndcY = -(localY / mapSize) * 2 + 1;
                const hit = loaderRef.current?.pickMinimapBlock(ndcX, ndcY);
                setSelectedBlock(hit);
              } else {
                setShowMinimap(false);
                setSelectedBlock(null);
              }
            }
          }}
        >
          <div className="w-[600px] max-w-[90vw] h-[600px] max-h-[90vh] border-2 border-cyan-500/50 shadow-[0_0_30px_rgba(0,255,255,0.2)] rounded-lg relative overflow-hidden flex items-center justify-center pointer-events-none">
            <div className="absolute top-4 bg-black/50 text-cyan-300 text-xs px-3 py-1 rounded font-mono border border-cyan-500/30 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              SATELLITE ORBITAL VIEW ACTIVATED
            </div>

            {selectedBlock && (
              <div className="absolute top-12 left-4 right-4 bg-cyan-900/80 backdrop-blur-md border border-cyan-400/50 p-3 rounded shadow-2xl">
                <p className="text-[10px] text-cyan-300 font-bold uppercase mb-1">Block Inspection</p>
                <p className="text-white font-mono text-sm text-center">
                  Coord: <span className="text-cyan-400">[{selectedBlock.metadata.x}, {selectedBlock.metadata.y}]</span>
                </p>
                <button
                  className="mt-2 w-full py-1 text-[10px] bg-red-400/20 text-red-300 rounded border border-red-500/30 pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); setSelectedBlock(null); }}
                >
                  CLEAR SELECTION
                </button>
              </div>
            )}

            <div className="absolute bottom-4 bg-black/70 backdrop-blur-md text-white px-4 py-2 rounded-lg font-mono border border-white/20 shadow-xl flex flex-col items-center">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                {isFollowing ? "Tracking Player" : "Detached View"}
              </span>
              <span ref={minimapBlockDisplayRef} className="text-sm font-bold text-cyan-400">
                Block [2026, 222] | main
              </span>
            </div>
          </div>

          {!isFollowing && (
            <button
              className="mt-6 px-6 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-full hover:bg-cyan-500/40 transition-all font-bold tracking-widest text-xs z-50 pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setIsFollowing(true);
                loaderRef.current?.resetMinimapFollow();
              }}
            >
              RECENTER ON PLAYER
            </button>
          )}

          <div className="mt-4 text-[10px] text-gray-400/60 font-bold tracking-widest uppercase flex gap-4">
            <span>Wheel: Zoom</span>
            <span>Drag: Pan</span>
            <span>Click: Inspect</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;