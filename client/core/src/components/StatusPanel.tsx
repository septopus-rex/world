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
    const raf = useRef<number>(0);

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
                    <div className="pt-1 border-t border-white/10 text-[9px] tracking-[0.25em] text-cyan-400/40">SEPTOPUS</div>
                </div>
            )}
        </div>
    );
}
