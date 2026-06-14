import { useEffect, useRef, useState } from 'react';
import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * Parkour HUD — only in `?level=parkour`. A run timer that stops at the finish,
 * a brief onboarding hint, and a completion overlay with the final time.
 */
export function ParkourHUD({ loader, ready }: { loader: DesktopLoader | null; ready: boolean }) {
    const active = ready && !!loader?.parkourActive;
    const [elapsed, setElapsed] = useState(0);
    const [done, setDone] = useState(false);
    const [showHint, setShowHint] = useState(true);
    const [best, setBest] = useState<number | null>(null);
    const [record, setRecord] = useState(false);
    const startRef = useRef<number>(0);

    useEffect(() => {
        if (!active || !loader) return;
        startRef.current = performance.now();
        setBest(loader.parkourBest);
        // setInterval (not rAF): the run timer keeps ticking and the finish is
        // detected even when the engine's rAF loop is paused (deterministic tests
        // stop it; a real hiccup shouldn't swallow the completion either).
        const id = setInterval(() => {
            const t = (performance.now() - startRef.current) / 1000;
            setElapsed(t);
            if (loader.levelComplete) {
                setRecord(loader.recordParkourTime(t)); // persist + is-new-best
                setBest(loader.parkourBest);
                setDone(true);
                clearInterval(id);
            }
        }, 100);
        const hint = setTimeout(() => setShowHint(false), 6000);
        return () => { clearInterval(id); clearTimeout(hint); };
    }, [active, loader]);

    if (!active) return null;
    const time = elapsed.toFixed(1);
    const bestStr = best != null ? `${best.toFixed(1)}s` : '—';

    return (
        <>
            <div
                data-testid="parkour-timer"
                className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-cyan-500/30 shadow-2xl pointer-events-none"
            >
                <span className="text-cyan-300 font-black text-lg tracking-widest tabular-nums">⏱ {time}s</span>
                <span className="text-white/40 text-xs tracking-widest uppercase tabular-nums">Best {bestStr}</span>
            </div>

            {showHint && !done && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/15 text-white/80 text-sm tracking-wide shadow-xl pointer-events-none">
                    WASD 移动 · Space 跳 · 抵达终点平台过关
                </div>
            )}

            {done && (
                <div
                    data-testid="parkour-complete"
                    className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50"
                >
                    <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-3xl bg-black/70 border border-cyan-500/40 shadow-2xl">
                        <div className="text-2xl font-black tracking-widest text-cyan-300">FINISH 🏁</div>
                        <div className="text-white/80 text-lg">用时 <span className="font-black tabular-nums text-white">{time}s</span></div>
                        {record
                            ? <div data-testid="parkour-record" className="text-yellow-300 font-black tracking-widest text-sm animate-pulse">★ NEW RECORD ★</div>
                            : <div className="text-white/50 text-sm tracking-widest">最佳 <span className="tabular-nums">{bestStr}</span></div>}
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-2 px-6 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 font-black tracking-widest uppercase text-sm hover:bg-cyan-500/30 transition-all"
                        >
                            重玩
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
