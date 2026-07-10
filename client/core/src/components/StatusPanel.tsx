import { useEffect, useRef, useState } from 'react';

/**
 * StatusPanel — top-left status chip, collapsed by default to a MINIMAL pill
 * (just a live status dot + chevron; no mode text). Tapping expands it to a
 * small card showing the engine MODE and the build version. Self-contained: it
 * runs its own rAF to mirror the loader's mode, so either shell can drop it in
 * without wiring. `version` is injected by the host (Vite `__APP_VERSION__`).
 */
export function StatusPanel({ loader, version, onInspect }: { loader: any; version: string; onInspect?: () => void }) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<string>('normal');
    const [jx, setJx] = useState('');
    const [jy, setJy] = useState('');
    const raf = useRef<number>(0);

    // Prefill the jump inputs with the current block each time the card opens.
    useEffect(() => {
        if (!open) return;
        const b = loader?.playerState?.block;
        if (Array.isArray(b)) { setJx(String(b[0])); setJy(String(b[1])); }
    }, [open, loader]);

    // Jump straight to a block by [x,y] (Septopus block coords). Uses the direct
    // teleport (the same dev primitive the action rail uses) → lands at the block
    // centre; the destination streams in. Ignores non-numeric input.
    const jump = () => {
        const x = parseInt(jx, 10), y = parseInt(jy, 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        loader?.teleportSeptopus?.([x, y]);
        setOpen(false);
    };

    useEffect(() => {
        const tick = () => {
            const m = loader?.engine?.getWorld?.()?.mode;
            if (m && m !== mode) setMode(String(m));
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [loader, mode]);

    const dot = mode === 'game' ? 'bg-green-400' : mode === 'edit' ? 'bg-amber-400' : 'bg-cyan-400';

    return (
        <div className="absolute top-3 left-3 z-20 pointer-events-auto select-none">
            <button
                data-testid="status-toggle"
                aria-label={`status: ${mode}`}
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 h-7 px-2 rounded-full bg-black/45 border border-white/10 backdrop-blur"
            >
                <span className={`w-2 h-2 rounded-full ${dot} shadow-[0_0_5px] shadow-current`} />
                {/* Collapsed = dot + chevron only (no mode text — that's what
                    "collapsed" means here); expanded reveals it below. */}
                <span className={`text-[9px] text-white/45 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
            </button>
            {open && (
                <div data-testid="status-body" className="mt-1.5 w-40 px-3 py-2 rounded-xl bg-black/55 border border-white/10 backdrop-blur text-[11px] font-mono space-y-1">
                    <div className="flex justify-between"><span className="text-white/40">模式</span><span className="text-cyan-200 uppercase font-bold">{mode}</span></div>
                    <div className="flex justify-between"><span className="text-white/40">版本</span><span className="text-cyan-200">v{version}</span></div>
                    {onInspect && (
                        <button data-testid="open-inspector" onClick={onInspect}
                            className="w-full mt-0.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-bold text-cyan-200 active:scale-95">
                            🔍 检视当前 block
                        </button>
                    )}
                    {/* Jump to a block by [x,y]. Inputs stop key events from leaking to
                        the engine's document-level input (arrows would drive the camera). */}
                    <div className="pt-1 border-t border-white/10">
                        <div className="text-white/40 mb-1">跳转 block</div>
                        <div className="flex items-center gap-1">
                            <input data-testid="jump-x" value={jx} inputMode="numeric" placeholder="x"
                                onChange={(e) => setJx(e.target.value)}
                                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') jump(); }}
                                className="w-10 px-1 py-0.5 rounded bg-black/40 border border-white/15 text-cyan-100 text-center outline-none focus:border-cyan-400/50" />
                            <input data-testid="jump-y" value={jy} inputMode="numeric" placeholder="y"
                                onChange={(e) => setJy(e.target.value)}
                                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') jump(); }}
                                className="w-10 px-1 py-0.5 rounded bg-black/40 border border-white/15 text-cyan-100 text-center outline-none focus:border-cyan-400/50" />
                            <button data-testid="jump-go" onClick={jump}
                                className="flex-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-bold active:scale-95">
                                跳转
                            </button>
                        </div>
                        <button data-testid="go-spawn" onClick={() => { loader?.goToSpawn?.(); setOpen(false); }}
                            className="w-full mt-1 py-1 rounded-lg bg-white/5 border border-white/15 text-[10px] font-bold text-white/70 active:scale-95">
                            🏠 回出生点
                        </button>
                    </div>
                    <div className="pt-1 border-t border-white/10 text-[9px] tracking-[0.25em] text-cyan-400/40">SEPTOPUS</div>
                </div>
            )}
        </div>
    );
}
