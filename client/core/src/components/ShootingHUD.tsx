import { useEffect, useState } from 'react';
import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * Shooting-range HUD — appears once the native range is set up. Mirrors the
 * engine's ShootingRangeSystem snapshot (score / accuracy / round timer): the
 * non-spatial shell the native game shape needs (gap #6), kept read-only — the
 * engine is the source of truth, this just polls it.
 */
export function ShootingHUD({ loader, ready }: { loader: DesktopLoader | null; ready: boolean }) {
    const [st, setSt] = useState<any>(null);

    useEffect(() => {
        if (!ready || !loader) return;
        // Poll on a timer (not rAF): the HUD keeps mirroring even when the engine's
        // rAF loop is paused (deterministic e2e drives engine.step directly).
        const id = setInterval(() => setSt(loader.shootingState()), 150);
        return () => clearInterval(id);
    }, [ready, loader]);

    if (!st) return null;
    const acc = st.shots > 0 ? Math.round((st.hits / st.shots) * 100) : 0;
    const time = Math.max(0, st.timeLeft).toFixed(0);
    const over = st.phase === 'over';

    return (
        <div
            data-testid="shooting-hud"
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-emerald-500/30 shadow-2xl pointer-events-none"
        >
            <span className="text-emerald-300 font-black text-lg tracking-widest tabular-nums">🎯 {st.score}</span>
            <span className="text-white/40 text-xs tracking-widest uppercase tabular-nums">命中率 {acc}%</span>
            <span className={`text-xs tracking-widest uppercase tabular-nums ${over ? 'text-red-400 font-black' : 'text-white/40'}`}>
                {over ? 'TIME' : `⏱ ${time}s`}
            </span>
        </div>
    );
}
