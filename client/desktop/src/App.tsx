import { useEffect, useRef, useState } from 'react';
import { Coords } from '@engine/core/utils/Coords';
import { useEngine } from '@core/lib/useEngine';
import { Compass } from './components/HUD';
import { InventoryPanel } from '@core/components/InventoryPanel';
import { HealthBar } from '@core/components/HealthBar';
import { Toaster } from '@core/components/Toaster';
import { ParkourHUD } from '@core/components/ParkourHUD';
import { MahjongHUD } from '@core/components/MahjongHUD';
import { PoolHUD } from '@core/components/PoolHUD';
import { ShootingHUD } from '@core/components/ShootingHUD';
import { LeaveGameDialog } from '@core/components/LeaveGameDialog';
import { WorldMap2D } from '@core/components/WorldMap2D';
import { AuthorChat } from './components/AuthorChat';
import { DialogueUI } from '@core/components/DialogueUI';
import { BookReader } from '@core/components/BookReader';
import { BoardPanel } from '@core/components/BoardPanel';
import { AvatarPicker } from '@core/components/AvatarPicker';
import { ActionRail } from './components/desktop/ActionRail';

function App() {
  const { loader, ready, mode, setMode, gameZoneActive, leaveIntent, activeGame, gameState, showMinimap, setShowMinimap, view, setView } = useEngine('three_demo');

  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [show2DMap, setShow2DMap] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [sandboxSaved, setSandboxSaved] = useState(false);
  const [sandboxCell, setSandboxCell] = useState<number | null>(null);
  const [sppStyles, setSppStyles] = useState<string[]>([]);
  const [sppStyle, setSppStyle] = useState<string | null>(null);

  // Minimap drag state
  const isDraggingMap = useRef(false);
  const lastMapPos = useRef({ x: 0, y: 0 });

  // Refs for high-performance direct DOM updates
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const compassCoordRef = useRef<HTMLSpanElement>(null);
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
        if (compassCoordRef.current || minimapBlockDisplayRef.current) {
          const state = loader.playerState;
          const [bx, by] = state.block;

          // Compass centre shows just the block coord; update textContent in place
          // (never innerHTML) and only when it changed.
          if (compassCoordRef.current) {
            const coord = `${bx}, ${by}`;
            if (compassCoordRef.current.textContent !== coord) compassCoordRef.current.textContent = coord;
          }
          if (minimapBlockDisplayRef.current) {
            const text = `BLOCK [${bx}, ${by}] | world: ${state.world}`;
            if (minimapBlockDisplayRef.current.textContent !== text) minimapBlockDisplayRef.current.textContent = text;
          }
        }
        // SPP craft: mirror the open-cell selection into the bar (two-level edit).
        const sel = loader.sandboxActive ? loader.sandboxSelectedCell : null;
        setSandboxCell((prev) => (prev === sel ? prev : sel));
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

      {/* SPP craft: a held "magic ball" you orbit. Two-level edit — tap a cell to
          open it, then tap its faces to cycle 实/门/窗/空; Esc closes the cell. */}
      {sandbox && (
        <div data-testid="sandbox-bar" className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-amber-950/80 border border-amber-400/30 backdrop-blur-md shadow-2xl">
          <span className="text-amber-200 text-sm font-bold tracking-wide">🪄 SPP 魔法球</span>
          {sandboxCell == null ? (
            <span data-testid="sandbox-hint" className="text-amber-100/70 text-[11px]">点一个格子 → 选中编辑 · 拖拽旋转 · W/S 缩放</span>
          ) : (
            <>
              <span data-testid="sandbox-hint" className="text-cyan-200 text-[11px] font-semibold">编辑 cell {sandboxCell} · 点面切换 实/门/窗/空</span>
              <button
                data-testid="close-cell"
                onClick={() => loader?.sandboxDeselect()}
                className="px-3 py-1 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/30 border border-cyan-300/40 text-cyan-100 text-xs font-bold"
              >↩︎ 退出该格 (Esc)</button>
            </>
          )}
          {/* 风格切换：换一套 StylePack → 同一批 cell 秒换风格（世界级 override）。
              coaster 是结构主题，不作视觉换皮，故从切换器排除。 */}
          <div data-testid="spp-style-switch" className="flex items-center gap-1 pl-3 border-l border-amber-400/20">
            <span className="text-amber-200/60 text-[10px] font-semibold">风格</span>
            {['basic', ...sppStyles.filter((s) => s !== 'basic' && s !== 'coaster')].map((s) => (
              <button
                key={s}
                data-testid={`spp-style-${s}`}
                onClick={() => { loader?.setSppStyle(s === 'basic' ? null : s); setSppStyle(s === 'basic' ? null : s); }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold border transition ${
                  (sppStyle ?? 'basic') === s
                    ? 'bg-cyan-400/30 border-cyan-300/60 text-cyan-50'
                    : 'bg-amber-400/10 border-amber-300/30 text-amber-100/80 hover:bg-amber-400/20'
                }`}
              >{s}</button>
            ))}
          </div>
          <button
            data-testid="save-sandbox"
            onClick={async () => { const ok = await loader?.saveSandbox(); if (ok) { setSandboxSaved(true); setTimeout(() => setSandboxSaved(false), 1800); } }}
            className="px-3 py-1 rounded-lg bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-300/40 text-emerald-100 text-xs font-bold"
          >{sandboxSaved ? '✓ 已写入' : '写入 Save'}</button>
          <button
            data-testid="exit-sandbox"
            onClick={() => { loader?.setSppStyle(null); setSppStyle(null); loader?.exitSandbox(); setSandbox(false); }}
            className="px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 text-xs font-bold"
          >退出 Exit</button>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-start pointer-events-none">
        {/* Pure label — must NOT intercept clicks meant for engine UI beneath. */}
        <div className="pointer-events-none select-none">
          <span className="text-[10px] font-black tracking-[0.3em] text-cyan-400/70 uppercase">Septopus · Desktop</span>
          <span data-testid="app-version" title={__APP_COMMIT__} className="ml-2 text-[9px] font-mono text-cyan-400/40">v{__APP_VERSION__}</span>
        </div>
        {/* Compass = heading + block coord in its centre, and the entry to the 3D
            region preview (satellite view). The big telemetry panel is gone. */}
        <Compass
          ref={compassNeedleRef}
          coordRef={compassCoordRef}
          onClick={() => setShowMinimap(true)}
        />
      </div>

      {ready && <InventoryPanel loader={loader} />}
      {ready && <HealthBar loader={loader} />}
      {ready && <DialogueUI loader={loader} />}
      {ready && <BookReader loader={loader} />}
      {ready && <BoardPanel loader={loader} />}
      <AvatarPicker loader={loader} ready={ready} />
      {ready && <Toaster loader={loader} />}
      <ParkourHUD loader={loader} ready={ready} />
      <ShootingHUD loader={loader} ready={ready} />
      <WorldMap2D loader={loader} open={show2DMap} onClose={() => setShow2DMap(false)} />
      <AuthorChat loader={loader} ready={ready} />

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

      {/* 'confirm'-policy games: stepping off the block keeps the round alive and
          asks whether to leave (vs the silent 'ephemeral' auto-exit). */}
      <LeaveGameDialog loader={loader} open={ready && leaveIntent} />

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

      {/* Touch affordances (joystick/jump) live in the MOBILE shell now
          (src/mobile/MobileApp.tsx, routed by main.tsx) — the desktop shell is
          keyboard/mouse only (specs/mobile-client.md M0). */}

      {showMinimap && (
        <div
          className="absolute inset-0 z-30 pointer-events-auto bg-black/80 flex flex-col items-center justify-center select-none"
          onWheel={(e) => loader?.applyMinimapZoom(e.deltaY > 0 ? -0.1 : 0.1)}
          onMouseDown={(e) => {
            // preventDefault stops the native selection/drag ghost (an arrow drifting
            // in from the page's top-left) while panning the satellite view.
            e.preventDefault();
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
            {/* One integrated control bar (the only chrome over the map): the player
                block doubles as the recenter button — a dot shows follow state
                (green=following / amber=detached) and clicking it while detached
                recenters; the selected block sits beside it with its own clear. This
                folds the old status line + RECENTER button + keymap legend into one. */}
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-auto"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                disabled={isFollowing}
                onClick={() => { setIsFollowing(true); loader?.resetMinimapFollow(); }}
                title={isFollowing ? 'Following player' : 'Recenter on player'}
                className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full font-mono border border-white/15 shadow-lg text-[11px] font-bold text-cyan-300 transition-all enabled:hover:border-cyan-400/60 disabled:cursor-default"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isFollowing ? 'bg-green-400' : 'bg-amber-400'}`}></span>
                <span ref={minimapBlockDisplayRef}>Block [----, ---] | main</span>
                {!isFollowing && <span className="text-cyan-400/80 leading-none">⟲</span>}
              </button>
              {selectedBlock?.metadata && (
                <span className="flex items-center gap-1.5 bg-cyan-900/70 backdrop-blur-md px-3 py-1 rounded-full font-mono border border-cyan-400/50 shadow-lg text-[11px] font-bold text-white">
                  <span className="text-cyan-300/60">SEL</span>
                  <span className="text-cyan-300">[{selectedBlock.metadata.x}, {selectedBlock.metadata.y}]</span>
                  <button onClick={() => setSelectedBlock(null)} title="Clear selection" className="text-cyan-300/60 hover:text-red-300 leading-none">✕</button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Icon action rail → components/desktop/ActionRail (M2 extraction;
          data-testid values verbatim — the e2e suite is untouched). */}
      <ActionRail
        loader={loader}
        view={view}
        setView={setView}
        mode={mode}
        setMode={setMode}
        onOpenMap={() => setShow2DMap(true)}
        onEnterSandbox={() => { loader?.enterSandbox(); setSandbox(true); setSppStyles(loader?.listSppStyles() ?? []); setSppStyle(loader?.sppStyle ?? null); }}
      />
    </div>
  );
}

export default App;
