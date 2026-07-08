import { useEffect, useState } from 'react';

/**
 * Minimal HP bar — consumes the engine's player:health events.
 * Hidden at full health (Normal-mode exploration stays clean); appears the
 * moment gameplay damage lands.
 */
export function HealthBar({ loader }: { loader: any }) {
    const [vitals, setVitals] = useState({ hp: 100, maxHp: 100 });

    useEffect(() => {
        if (!loader?.engine) return;
        const handler = (payload: any) => {
            if (payload && typeof payload.hp === 'number') setVitals({ hp: payload.hp, maxHp: payload.maxHp ?? 100 });
        };
        loader.engine.on('player:health', handler);
        return () => loader.engine?.off('player:health', handler);
    }, [loader]);

    if (vitals.hp >= vitals.maxHp) return null;
    const pct = Math.max(0, Math.round((vitals.hp / vitals.maxHp) * 100));

    return (
        <div
            data-testid="health-bar"
            className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-56 pointer-events-none"
        >
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-[9px] font-black tracking-[0.25em] text-red-400/80 uppercase">HP</span>
                <span className="text-[10px] font-mono text-red-300">{vitals.hp} / {vitals.maxHp}</span>
            </div>
            <div className="h-2 rounded-full bg-black/60 border border-red-500/40 overflow-hidden backdrop-blur-md">
                <div
                    className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
