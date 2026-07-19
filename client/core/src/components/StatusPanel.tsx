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
    const [shadows, setShadows] = useState(false);
    const [perf, setPerf] = useState({ fps: 0, calls: 0, tris: 0 });
    const raf = useRef<number>(0);
    const fpsWin = useRef<{ last: number; frames: number; since: number }>({ last: 0, frames: 0, since: 0 });

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
        const tick = (now: number) => {
            const m = loader?.engine?.getWorld?.()?.mode;
            if (m && m !== mode) setMode(String(m));
            // Frame rate, sampled here rather than in the engine: this rAF and the
            // engine's are throttled by the SAME compositor, so the interval
            // between our callbacks IS the real frame time. Averaged over ~0.5 s
            // windows — a per-frame number is unreadable. Only while the card is
            // open (a closed panel shouldn't pay for a debug HUD).
            if (open) {
                const w = fpsWin.current;
                if (w.last) { w.frames++; w.since += now - w.last; }
                w.last = now;
                if (w.since >= 500) {
                    const info = loader?.perfInfo?.();
                    setPerf({
                        fps: Math.round((w.frames * 1000) / w.since),
                        calls: Number(info?.calls ?? 0),
                        tris: Number(info?.triangles ?? 0),
                    });
                    w.frames = 0; w.since = 0;
                }
            } else {
                fpsWin.current = { last: 0, frames: 0, since: 0 };
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [loader, mode, open]);

    // Mirror the engine's live shadow state each time the card opens.
    useEffect(() => { if (open) setShadows(!!loader?.shadowsEnabled?.()); }, [open, loader]);

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
                    {/* Renderer A/B: frame rate (sampled from this component's own
                        rAF) + last frame's GPU work. Draw calls roughly double with
                        shadows on — the sun re-draws every caster into a depth map
                        before the beauty pass. */}
                    <div className="flex justify-between">
                        <span className="text-white/40">帧率</span>
                        <span className={perf.fps >= 50 ? 'text-emerald-300' : perf.fps >= 30 ? 'text-amber-300' : 'text-rose-300'}>
                            {perf.fps || '–'} fps
                        </span>
                    </div>
                    <div className="flex justify-between"><span className="text-white/40">绘制</span>
                        <span className="text-cyan-200">{perf.calls} · {(perf.tris / 1000).toFixed(0)}k△</span></div>
                    <button data-testid="toggle-shadows"
                        onClick={() => { const next = !shadows; loader?.setShadows?.(next); setShadows(next); }}
                        className={`w-full mt-0.5 py-1 rounded-lg border text-[10px] font-bold active:scale-95 ${shadows
                            ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                            : 'bg-white/5 border-white/15 text-white/60'}`}>
                        {shadows ? '☀ 阴影 开' : '☀ 阴影 关'}
                    </button>
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
