import { useEffect, useRef, useState } from 'react';
import { Coords } from '@engine/core/utils/Coords';
import { useIsMobile } from './lib/useIsMobile';
import { useEngine } from './lib/useEngine';
import { Joystick } from './components/Joystick';
import { Compass, TelemetryReadout } from './components/HUD';
import { InventoryPanel } from './components/InventoryPanel';
import { HealthBar } from './components/HealthBar';
import { ParkourHUD } from './components/ParkourHUD';
import { MahjongHUD } from './components/MahjongHUD';
import { PoolHUD } from './components/PoolHUD';
import { WorldMap2D } from './components/WorldMap2D';

function App() {
  const isMobile = useIsMobile();
  const { loader, ready, mode, setMode, gameZoneActive, activeGame, gameState, showMinimap, setShowMinimap, view, setView } = useEngine('three_demo');

  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [show2DMap, setShow2DMap] = useState(false);

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
          // Heading via the single Coords conversion (engine yaw → Septopus heading,
          // CW-from-North) — same source the 2D map uses, no hand-rolled sign.
          const headingDeg = (Coords.engineYawToHeading(yawRad) * 180) / Math.PI;
          compassNeedleRef.current.style.transform = `rotate(${headingDeg}deg)`;
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
      <WorldMap2D loader={loader} open={show2DMap} onClose={() => setShow2DMap(false)} />

      {/* Game-mode entry is ZONE-GATED: this prompt appears only while the player
          stands in a playable block (block.game, surfaced via game.zone_enter).
          Clicking is the explicit player action that funnels into the engine's
          zone-gated setMode(Game). Leaving the block auto-reverts to Normal. */}
      {ready && gameZoneActive && mode !== 'game' && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col items-center gap-2">
          <span className="text-[10px] font-black tracking-[0.3em] text-green-300/80 uppercase animate-pulse">Playable Zone</span>
          <button
            data-testid="enter-game"
            onClick={() => setMode('game')}
            className="px-6 py-2.5 rounded-2xl text-sm font-black tracking-widest uppercase text-green-200 bg-green-500/25 border border-green-400/60 hover:bg-green-500/40 active:scale-95 transition-all shadow-2xl flex items-center gap-2"
          >
            <span className="text-base leading-none">▶</span> 进入游戏 · Enter Game
          </button>
        </div>
      )}
      {/* In-world games: when a session is live, the active game's HUD drives it
          (game.md external-API runtime). The HUD is picked by the active game name
          (engine = source of truth); each HUD's "Leave" exits Game mode, so the
          generic exit button is hidden while any game HUD is up. */}
      {ready && loader && activeGame === 'mahjong' && gameState && <MahjongHUD state={gameState} loader={loader} />}
      {ready && loader && activeGame === 'pool' && gameState && <PoolHUD state={gameState} loader={loader} />}

      {ready && mode === 'game' && !activeGame && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            data-testid="exit-game"
            onClick={() => setMode('normal')}
            className="px-5 py-2 rounded-2xl text-xs font-black tracking-widest uppercase text-red-200 bg-red-500/20 border border-red-400/50 hover:bg-red-500/35 active:scale-95 transition-all shadow-2xl flex items-center gap-2"
          >
            <span className="text-sm leading-none">■</span> 退出游戏 · Exit Game
          </button>
        </div>
      )}

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
          data-testid="stamp-scene"
          onClick={() => { const b = loader?.playerState?.block; if (b) loader?.stampTestScene(b[0], b[1]); }}
          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 backdrop-blur-md rounded-lg text-[10px] font-bold text-amber-300 tracking-widest uppercase transition-all flex items-center gap-2 group"
          title="Stamp the demo test scene onto the current block (persisted draft)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:animate-pulse"></span>
          导入测试场景
        </button>
        <button
          data-testid="reset-state"
          onClick={() => { if (confirm("Reset ALL local edits (blocks, position, inventory) to the pristine seed?")) loader?.resetWorld(); }}
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
        <button
          data-testid="map2d-toggle"
          onClick={() => setShow2DMap(true)}
          className="px-4 py-3 border backdrop-blur-md rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 shadow-2xl bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
          title="Open the 2D world map"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          2D MAP
        </button>
        <div className="flex flex-col gap-1 p-1.5 border border-cyan-500/30 bg-black/40 backdrop-blur-md rounded-2xl shadow-2xl">
          <span className="text-[8px] font-black tracking-[0.25em] text-cyan-500/60 uppercase text-center">Mode</span>
          {/* GAME is intentionally NOT a free toggle here — Game mode is entered
              only from inside a playable block via the zone prompt (below), the
              data-driven, interpreter-agnostic entry contract. */}
          {([
            { key: 'normal', label: 'NORMAL', on: 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60', dot: 'bg-cyan-400' },
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
