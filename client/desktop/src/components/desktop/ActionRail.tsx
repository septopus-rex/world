import { MAZE_BLOCK, MAZE_ENTRY } from '@core/scenes/mazeScene';
import { DYN_BLOCK, DYN_VIEW } from '@core/scenes/dynamicAdjunctScene';
import type { WorldMode } from '@core/lib/useEngine';

/**
 * ActionRail — the DESKTOP shell's right-edge icon column (M2 extraction from
 * App.tsx, JSX + data-testid values verbatim so the e2e suite is untouched):
 * scene/dev actions → view toggle → modes → reset. The mobile shell has its own
 * chrome (mobile/MobileApp.tsx); this file is desktop-only presentation.
 */
export function ActionRail({ loader, view, setView, mode, setMode, onOpenMap, onEnterSandbox }: {
    loader: any;
    view: 'first' | 'third';
    setView: (v: 'first' | 'third') => void;
    mode: WorldMode;
    setMode: (m: WorldMode) => boolean;
    onOpenMap: () => void;
    onEnterSandbox: () => void;
}) {
    return (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5 p-1.5 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-auto">
            {([
                { id: 'stamp-scene', icon: '🧪', title: '导入测试场景 · Stamp test scene onto current block', onClick: () => { const b = loader?.playerState?.block; if (b) loader?.stampTestScene(b[0], b[1]); } },
                { id: 'enter-sandbox', icon: '🏖️', title: 'SPP 沙盘 · Sandbox diorama', onClick: onEnterSandbox },
                { id: 'goto-maze', icon: '🏛️', title: '迷宫 · Athenian labyrinth', onClick: () => loader?.teleportSeptopus(MAZE_BLOCK, MAZE_ENTRY) },
                { id: 'goto-dynamic', icon: '🧩', title: '动态 Adjunct · Dynamic showcase', onClick: () => loader?.teleportSeptopus(DYN_BLOCK, DYN_VIEW) },
                { id: 'map2d-toggle', icon: '🗺️', title: '2D 地图 · World map', onClick: onOpenMap },
            ] as const).map((a) => (
                <button
                    key={a.id}
                    data-testid={a.id}
                    title={a.title}
                    onClick={a.onClick}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-lg leading-none bg-white/5 hover:bg-white/15 border border-white/10 transition-all active:scale-95"
                >
                    {a.icon}
                </button>
            ))}

            {/* first/third-person view toggle (stateful icon) */}
            <button
                title={view === 'third' ? '第三人称 → 切第一人称' : '第一人称 → 切第三人称'}
                onClick={() => setView(view === 'third' ? 'first' : 'third')}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-lg leading-none bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all active:scale-95"
            >
                {view === 'third' ? '🎥' : '👁️'}
            </button>

            <div className="w-6 h-px bg-white/15 my-0.5" />

            {/* Modes. GAME is intentionally NOT here — it is entered only from inside a
                playable block via the zone prompt (the interpreter-agnostic contract). */}
            {([
                { key: 'normal', icon: '🚶', label: 'NORMAL', on: 'bg-cyan-500/25 border-cyan-400/60' },
                { key: 'ghost', icon: '👻', label: 'GHOST', on: 'bg-purple-500/25 border-purple-400/60' },
                { key: 'observe', icon: '🛰️', label: 'OBSERVE', on: 'bg-sky-500/25 border-sky-400/60' },
                { key: 'edit', icon: '✏️', label: 'EDIT', on: 'bg-yellow-500/25 border-yellow-400/60' },
            ] as const).map((m) => (
                <button
                    key={m.key}
                    data-testid={`mode-${m.key}`}
                    title={`模式 · ${m.label}`}
                    onClick={() => setMode(m.key)}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg leading-none border transition-all active:scale-95 ${
                        mode === m.key ? m.on : 'bg-white/5 border-white/10 hover:bg-white/15'
                    }`}
                >
                    {m.icon}
                </button>
            ))}

            <div className="w-6 h-px bg-white/15 my-0.5" />

            {/* Reset (destructive) — kept apart at the bottom. */}
            <button
                data-testid="reset-state"
                title="Reset State · 重置本地存档（方块/位置/背包 → 种子）"
                onClick={() => { if (confirm("Reset ALL local edits (blocks, position, inventory) to the pristine seed?")) loader?.resetWorld(); }}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-lg leading-none bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all active:scale-95"
            >
                ♻️
            </button>
        </div>
    );
}
