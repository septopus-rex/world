import { useEffect, useState } from 'react';
import MobileApp from './MobileApp';
import DesktopApp from '../../desktop/src/App';
import StylePackEditor from '../../editor/src/StylePackEditor';

export type ChainShell = 'mobile' | 'desktop' | 'editor';

function initialShell(): ChainShell {
    try {
        const q = new URLSearchParams(window.location.search).get('shell');
        if (q === 'desktop' || q === 'editor' || q === 'mobile') return q;
    } catch { /* ignore */ }
    return 'mobile';
}

/**
 * ChainSystemApp — Unified root for the `septopus.loader` chain bundle
 * (protocol/cn|en/boot-chain.md §3 + land.md).
 *
 * Packs the entire Septopus system into ONE content-addressed loader document:
 *   · Mobile 3D World shell (touch joystick + action pad + Solana LandPanel)
 *   · Desktop 3D World shell (keyboard/mouse + ActionRail + SPP 魔法球 + Solana LandPanel)
 *   · SPP 粒子工坊 (StylePack 3D Collapse Dial editor + IPFS CID publisher)
 *
 * Switching between Mobile and Desktop hot-swaps the HUD overlay over the
 * singleton `#three_demo` WebGL engine in 0ms (zero reload, preserves player
 * position, wallet session, and loaded blocks). Switching to the SPP 粒子工坊
 * pauses the world rAF loop while the particle preview engine runs, and syncs
 * any authored/published StylePack directly back into the live 3D world.
 */
export default function ChainSystemApp() {
    const [shell, setShell] = useState<ChainShell>(initialShell);
    const [worldVisited, setWorldVisited] = useState(() => initialShell() !== 'editor');
    const [editorVisited, setEditorVisited] = useState(() => initialShell() === 'editor');

    const switchShell = (next: ChainShell) => {
        if (next === 'editor') setEditorVisited(true);
        else setWorldVisited(true);
        setShell(next);
    };

    // Pause the inactive 3D engine's rAF loop so at most ONE WebGL render loop
    // runs at any moment.
    useEffect(() => {
        const worldEngine = (window as any).loader?.engine;
        const spEngine = (window as any).spLoader?.getEngine?.();
        if (shell === 'editor') {
            try { worldEngine?.stop?.(); } catch { /* ignore */ }
            try { spEngine?.start?.(); } catch { /* ignore */ }
        } else {
            try { spEngine?.stop?.(); } catch { /* ignore */ }
            try { worldEngine?.start?.(); } catch { /* ignore */ }
        }
    }, [shell]);

    return (
        <div data-testid="chain-system-root" className="relative w-screen h-screen overflow-hidden bg-black text-white">
            {worldVisited && shell === 'mobile' && <MobileApp />}
            {worldVisited && shell === 'desktop' && <DesktopApp />}
            {editorVisited && (
                <div
                    data-testid="chain-editor-layer"
                    className={shell === 'editor' ? 'absolute inset-0 z-40' : 'hidden'}
                >
                    <StylePackEditor />
                </div>
            )}

            {/* Unified System Bar — sits at bottom-center in the 3D world (between
                the mobile thumb plates) and bottom-left in the SPP editor (clear of
                the bottom-center CollapseDial). */}
            <div
                data-testid="chain-system-bar"
                className={`fixed z-50 pointer-events-auto flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 border border-cyan-400/35 backdrop-blur-md shadow-xl font-mono text-[10px] select-none ${
                    shell === 'editor' ? 'bottom-4 left-4' : 'bottom-2.5 left-1/2 -translate-x-1/2'
                }`}
            >
                <span className="px-1.5 text-cyan-300/70 font-bold tracking-wider uppercase hidden sm:inline">Loader</span>
                {([
                    { id: 'mobile', label: '📱 触屏', testId: 'chain-shell-mobile' },
                    { id: 'desktop', label: '🖥 桌面', testId: 'chain-shell-desktop' },
                    { id: 'editor', label: '🧬 粒子工坊', testId: 'chain-shell-editor' },
                ] as const).map((item) => (
                    <button
                        key={item.id}
                        data-testid={item.testId}
                        aria-pressed={shell === item.id}
                        onClick={() => switchShell(item.id)}
                        className={`px-2.5 py-0.5 rounded-full font-bold transition ${
                            shell === item.id
                                ? 'bg-cyan-400/30 border border-cyan-300/60 text-cyan-50'
                                : 'text-white/65 hover:text-white hover:bg-white/10 border border-transparent'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
