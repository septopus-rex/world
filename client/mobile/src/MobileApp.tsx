import { useEffect, useState } from 'react';
import { useEngine } from '@core/lib/useEngine';
import { Joystick } from '@core/components/Joystick';
import { InventoryPanel } from '@core/components/InventoryPanel';
import { HealthBar } from '@core/components/HealthBar';
import { Toaster } from '@core/components/Toaster';
import { DialogueUI } from '@core/components/DialogueUI';
import { BookReader } from '@core/components/BookReader';
import { BoardPanel } from '@core/components/BoardPanel';
import { LeaveGameDialog } from '@core/components/LeaveGameDialog';
import { WorldMap2D } from '@core/components/WorldMap2D';
import { AvatarPicker } from '@core/components/AvatarPicker';
import { ParkourHUD } from '@core/components/ParkourHUD';
import { ShootingHUD } from '@core/components/ShootingHUD';
import { MahjongHUD } from '@core/components/MahjongHUD';
import { PoolHUD } from '@core/components/PoolHUD';
import { StatusPanel } from '@core/components/StatusPanel';
import { MiniCompass } from '@core/components/MiniCompass';
import { BlockInspector } from '@core/components/BlockInspector';

/**
 * MobileApp — the MOBILE shell (specs/mobile-client.md M1+M3). Same shared core
 * as the desktop shell (useEngine → DesktopLoader → the pure-data world); only
 * the chrome and input affordances differ:
 *
 *   · left virtual joystick → loader.setPlayerMoveIntent (camera-relative, the
 *     same channel the e2e drives)
 *   · drag on the canvas    → engine-native touch look (InputProvider → CameraRig)
 *   · tap                   → browser-synthesized click → the raycast interact path
 *   · JUMP button           → loader.triggerPlayerJump()
 *   · view toggle (below JUMP) → useEngine view state → loader.setCameraView
 *     (default third-person top-down ⇄ first-person)
 *   · panels (bag/map/avatar) → shared components; map via MiniCompass (UI rework pending)
 *
 * Interaction surface (dialogue / book / HP / toasts / game HUDs / leave dialog)
 * is the SAME shared component set the desktop uses — shells only compose.
 */
export default function MobileApp() {
    const { loader, ready, mode, setMode, gameZoneActive, leaveIntent, activeGame, gameState, view, setView } = useEngine('three_demo');
    const [sheet, setSheet] = useState<'bag' | 'map' | 'avatar' | null>(null);
    const [inspecting, setInspecting] = useState(false);

    // Fade out the boot splash once the world is ready (same as the desktop shell).
    useEffect(() => {
        if (!ready) return;
        const el = document.getElementById('init-loader');
        if (el) {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 700);
        }
    }, [ready]);

    return (
        <div data-testid="mobile-app" className="relative w-screen h-screen overflow-hidden bg-black text-white select-none">
            {/* The engine canvas host — drag = look (engine-native touch), tap = interact. */}
            <div id="three_demo" className="absolute inset-0 z-0 w-full h-full"></div>

            {/* ── top-left: collapsible status (mode + version, collapsed by default);
                   top-right: mini compass + block coord / world id ── */}
            {ready && <StatusPanel loader={loader} version={__APP_VERSION__} onInspect={() => setInspecting(true)} />}
            {ready && <MiniCompass loader={loader} onOpenMap={() => setSheet('map')} />}
            {ready && <BlockInspector loader={loader} open={inspecting} onClose={() => setInspecting(false)} />}

            {/* ── shared interaction surface (identical components to desktop) ── */}
            {ready && <HealthBar loader={loader} />}
            {ready && <DialogueUI loader={loader} />}
            {ready && <BookReader loader={loader} />}
            {ready && <BoardPanel loader={loader} />}
            {ready && <Toaster loader={loader} />}
            <ParkourHUD loader={loader} ready={ready} />
            <ShootingHUD loader={loader} ready={ready} />
            {ready && loader && activeGame === 'mahjong' && gameState && <MahjongHUD state={gameState} loader={loader} />}
            {ready && loader && activeGame === 'pool' && gameState && <PoolHUD state={gameState} loader={loader} />}
            <LeaveGameDialog loader={loader} open={ready && leaveIntent} />

            {/* ── zone-gated game entry / exit (same contract as desktop) ── */}
            {ready && gameZoneActive && mode !== 'game' && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <button data-testid="enter-game" onClick={() => setMode('game')}
                        className="px-5 py-2.5 rounded-2xl text-sm font-black tracking-widest uppercase text-green-200 bg-green-500/25 border border-green-400/60 active:scale-95 shadow-2xl">
                        ▶ 进入游戏
                    </button>
                </div>
            )}
            {ready && mode === 'game' && !activeGame && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <button data-testid="exit-game" onClick={() => setMode('normal')}
                        className="px-4 py-2 rounded-2xl text-xs font-black tracking-widest uppercase text-red-200 bg-red-500/20 border border-red-400/50 active:scale-95 shadow-2xl">
                        ■ 退出游戏
                    </button>
                </div>
            )}

            {/* ── movement: virtual joystick (left thumb) + jump (right thumb) ── */}
            <div data-testid="m-joystick" className="absolute bottom-9 left-6 z-20 pointer-events-none">
                <Joystick size={130}
                    onMove={(d) => loader?.setPlayerMoveIntent(d.x, d.y)}
                    onStop={() => loader?.setPlayerMoveIntent(0, 0)} />
            </div>
            <div className="absolute bottom-24 right-6 z-20 pointer-events-auto">
                <button data-testid="m-jump"
                    onPointerDown={(e) => { e.preventDefault(); loader?.triggerPlayerJump(); }}
                    className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/30 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-xl">
                    <span className="font-extrabold text-white text-xs tracking-widest opacity-90">JUMP</span>
                </button>
            </div>

            {/* View toggle — directly below JUMP. Flips the camera between the
                default third-person follow-cam (slight top-down, avatar visible)
                and first-person (at the eyes). Reuses the SAME useEngine view
                state the desktop ActionRail drives → loader.setCameraView; the
                icon shows the CURRENT mode (🎥 third / 👁️ first). */}
            <div className="absolute bottom-8 right-7 z-20 pointer-events-auto">
                {/* onClick (single fire) — a discrete toggle, unlike JUMP's
                    hold-friendly onTouchStart. Handling BOTH touch and mouse would
                    double-fire on a real tap (touch + synthesized mouse) and cancel
                    the toggle out; a tap's synthesized click fires exactly once. */}
                <button data-testid="m-view-toggle"
                    onClick={() => setView(view === 'third' ? 'first' : 'third')}
                    className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/25 backdrop-blur-md flex flex-col items-center justify-center gap-0.5 active:scale-95 shadow-xl">
                    <span className="text-lg leading-none">{view === 'third' ? '🎥' : '👁️'}</span>
                    <span className="text-[8px] font-bold tracking-widest text-white/70 leading-none">{view === 'third' ? '俯视' : '第一'}</span>
                </button>
            </div>

            {/* Bottom-sheet trigger buttons removed (UI rework pending). Panels
                below stay wired: the map opens via the top-right MiniCompass;
                bag / avatar await a new trigger. */}
            {/* Bag sheet: a visible container even when empty (the shared
                InventoryPanel renders null on an empty bag); items reuse it. */}
            {ready && sheet === 'bag' && (
                <div data-testid="m-bag-sheet" className="absolute bottom-16 left-3 z-30 pointer-events-none">
                    <div className="px-2.5 py-1 rounded-lg bg-black/50 border border-cyan-500/30 text-[10px] font-black tracking-widest uppercase text-cyan-300/80">
                        🎒 背包 · Bag
                    </div>
                    <InventoryPanel loader={loader} />
                </div>
            )}
            <WorldMap2D loader={loader} open={sheet === 'map'} onClose={() => setSheet(null)} />
            {sheet === 'avatar' && <AvatarPicker loader={loader} ready={ready} />}
        </div>
    );
}
