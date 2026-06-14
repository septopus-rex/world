import { useEffect, useRef, useState } from 'react';
import { Coords } from '@engine/core/utils/Coords';
import { useIsMobile } from './lib/useIsMobile';
import { useEngine } from './lib/useEngine';
import { Joystick } from './components/Joystick';
import { Compass, TelemetryReadout } from './components/HUD';
import { InventoryPanel } from './components/InventoryPanel';
import { HealthBar } from './components/HealthBar';
import { ParkourHUD } from './components/ParkourHUD';

function App() {
  const isMobile = useIsMobile();
  const { loader, ready, mode, setMode, showMinimap, setShowMinimap, view, setView } = useEngine('three_demo');

  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const currentBlockRef = useRef<[number, number]>([0, 0]);

  // Minimap drag state
  const isDraggingMap = useRef(false);
  const lastMapPos = useRef({ x: 0, y: 0 });

  // Refs for high-performance direct DOM updates
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const compassBlockDisplayRef = useRef<HTMLDivElement>(null);
  const minimapBlockDisplayRef = useRef<HTMLSpanElement>(null);

  // Fade out the boot splash once the world is ready.
  useEffect(() => {
    if (!ready) return;
    const el = document.getElementById('init-loader');
    if (el) {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 700);
    }
  }, [ready]);

  // High-performance HUD animation loop
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

          if (bx !== currentBlockRef.current[0] || by !== currentBlockRef.current[1]) {
            currentBlockRef.current = [bx, by];
          }
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
        {/* Pure label — must NOT intercept clicks meant for engine UI beneath. */}
        <div className="pointer-events-none select-none">
          <span className="text-[10px] font-black tracking-[0.3em] text-cyan-400/70 uppercase">Septopus · Desktop</span>
        </div>
        <div className="flex flex-col gap-4 items-end pointer-events-auto">
          <Compass ref={compassNeedleRef} />
          <TelemetryReadout
            ref={compassBlockDisplayRef}
            onClick={() => setShowMinimap(!showMinimap)}
          />
        </div>
      </div>

      {ready && <InventoryPanel loader={loader} />}
      {ready && <HealthBar loader={loader} />}
      <ParkourHUD loader={loader} ready={ready} />

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
          onClick={() => setView(view === 'third' ? 'first' : 'third')}
          className="px-4 py-3 border backdrop-blur-md rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 shadow-2xl bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
          title="Switch first/third-person view"
        >
          <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
          {view === 'third' ? '3RD PERSON' : '1ST PERSON'}
        </button>
        <div className="flex flex-col gap-1 p-1.5 border border-cyan-500/30 bg-black/40 backdrop-blur-md rounded-2xl shadow-2xl">
          <span className="text-[8px] font-black tracking-[0.25em] text-cyan-500/60 uppercase text-center">Mode</span>
          {([
            { key: 'normal', label: 'NORMAL', on: 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60', dot: 'bg-cyan-400' },
            { key: 'game', label: 'GAME', on: 'bg-green-500/25 text-green-300 border border-green-400/60', dot: 'bg-green-400' },
            { key: 'ghost', label: 'GHOST', on: 'bg-purple-500/25 text-purple-300 border border-purple-400/60', dot: 'bg-purple-400' },
            { key: 'observe', label: 'OBSERVE', on: 'bg-sky-500/25 text-sky-300 border border-sky-400/60', dot: 'bg-sky-400' },
            { key: 'edit', label: 'EDIT', on: 'bg-yellow-500/25 text-yellow-300 border border-yellow-400/60', dot: 'bg-yellow-400' },
          ] as const).map(({ key, label, on, dot }) => (
            <button
              key={key}
              data-testid={`mode-${key}`}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-2 ${
                mode === key ? on : 'text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${mode === key ? `${dot} animate-pulse` : 'bg-gray-600'}`}></div>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
