'use client';

import { useEffect, useRef, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Coords } from '../../engine/src/core/utils/Coords';
import { useIsMobile } from './lib/useIsMobile';
import { Joystick } from './components/Joystick';
import { useSeptopusEngine } from './hooks/useSeptopusEngine';
import { Compass, TelemetryReadout } from './components/HUD';

function App() {
  const isMobile = useIsMobile();
  const { loader, isEditMode, setIsEditMode, showMinimap, setShowMinimap } = useSeptopusEngine('three_demo');

  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  // Minimap Drag State
  const isDraggingMap = useRef(false);
  const lastMapPos = useRef({ x: 0, y: 0 });

  // Refs for high-performance direct DOM manipulation
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const compassBlockDisplayRef = useRef<HTMLDivElement>(null);
  const minimapBlockDisplayRef = useRef<HTMLSpanElement>(null);

  // High performance HUD animation loop
  useEffect(() => {
    let animationId: number;
    const updateHUD = () => {
      if (loader) {
        if (compassNeedleRef.current) {
          const yawRad = loader.getPlayerRotationY();
          const degrees = (yawRad * 180) / Math.PI;
          compassNeedleRef.current.style.transform = `rotate(${-degrees}deg)`;
        }
        if (compassBlockDisplayRef.current || minimapBlockDisplayRef.current) {
          const state = loader.playerState;
          const [bx, by] = state.block;
          const [rx, ry, rz] = state.position;
          const text = `BLOCK [${bx}, ${by}]`;
          const subText = `REL X:${rx.toFixed(1)} Y:${ry.toFixed(1)} Z:${rz.toFixed(1)}`;
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
  }, [loader]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans touch-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div id="three_demo" className="absolute inset-0 z-0 w-full h-full"></div>

      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-start pointer-events-none">
        <div></div>
        <div className="flex flex-col gap-4 items-end pointer-events-auto">
          <WalletMultiButton style={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
          <Compass ref={compassNeedleRef} />
          <TelemetryReadout
            ref={compassBlockDisplayRef}
            onClick={() => setShowMinimap(!showMinimap)}
          />
        </div>
      </div>

      {isMobile && (
        <>
          <div className="absolute bottom-8 left-8 z-20 pointer-events-none">
            <Joystick
              size={130}
              onMove={(data) => loader?.setPlayerMoveIntent(data.x, data.y)}
              onStop={() => loader?.setPlayerMoveIntent(0, 0)}
            />
          </div>
          <div className="absolute bottom-8 right-8 z-20 pointer-events-auto">
            <button
              className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border-2 border-white/30 backdrop-blur-md flex items-center justify-center active:scale-95 transition-all shadow-xl"
              onTouchStart={(e) => { e.preventDefault(); loader?.triggerPlayerJump(); }}
            >
              <span className="font-extrabold text-white text-xs tracking-widest opacity-90">JUMP</span>
            </button>
          </div>
        </>
      )}

      {showMinimap && (
        <div
          className="absolute inset-0 z-30 pointer-events-auto bg-black/80 flex flex-col items-center justify-center"
          onWheel={(e) => loader?.applyMinimapZoom(e.deltaY > 0 ? -0.1 : 0.1)}
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
              loader?.panMinimap(-dx, -dy);
            }
          }}
          onMouseUp={() => { isDraggingMap.current = false; }}
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
                const hit = loader?.pickMinimapBlock(ndcX, ndcY);
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
                Block [----, ---] | main
              </span>
            </div>
          </div>

          {!isFollowing && (
            <button
              className="mt-6 px-6 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-full hover:bg-cyan-500/40 transition-all font-bold tracking-widest text-xs z-50 pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); setIsFollowing(true); loader?.resetMinimapFollow(); }}
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

      <div className="absolute bottom-4 right-4 z-40 p-2 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => { if (confirm("Reset player position and state?")) { localStorage.removeItem("spp_player_state"); window.location.reload(); } }}
          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 backdrop-blur-md rounded-lg text-[10px] font-bold text-red-400 tracking-widest uppercase transition-all flex items-center gap-2 group"
          title="Reset Saved State"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 group-hover:animate-pulse"></span>
          Reset State
        </button>
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-4 py-3 border backdrop-blur-md rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 shadow-2xl ${isEditMode ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'}`}
        >
          <div className={`w-2 h-2 rounded-full ${isEditMode ? 'bg-yellow-400 animate-pulse' : 'bg-cyan-500'}`}></div>
          {isEditMode ? 'EXIT EDIT' : 'ENTER EDIT'}
        </button>
      </div>
    </div>
  );
}

export default App;