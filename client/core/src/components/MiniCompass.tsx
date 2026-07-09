import { useEffect, useRef, useState } from 'react';
import { Coords } from '@engine/core/utils/Coords';

/**
 * MiniCompass — top-right compact compass + a readout of the current block
 * coordinate and world id. A clean two-tone needle points to true NORTH (it
 * rotates opposite the player heading); a fixed tick at the top marks the way
 * you face. Self-contained: its own rAF spins the needle (loader.getPlayerRotationY
 * → Coords.engineYawToHeading) and refreshes the coord (loader.playerState.block)
 * / world (loader.worldInfo()). Tapping opens the 2D map when `onOpenMap` is set.
 */
export function MiniCompass({ loader, onOpenMap }: { loader: any; onOpenMap?: () => void }) {
    const needle = useRef<HTMLDivElement>(null);
    const [coord, setCoord] = useState('--, --');
    const [world, setWorld] = useState<{ id: number; nickname: string }>({ id: 0, nickname: '' });
    const raf = useRef<number>(0);

    useEffect(() => {
        const tick = () => {
            if (loader) {
                if (needle.current && loader.getPlayerRotationY) {
                    // Needle points to NORTH → rotate by -heading (dial fixed, north seeks).
                    const deg = -(Coords.engineYawToHeading(loader.getPlayerRotationY()) * 180) / Math.PI;
                    needle.current.style.transform = `rotate(${deg}deg)`;
                }
                const b = loader.playerState?.block;
                if (b) { const c = `${b[0]}, ${b[1]}`; setCoord((p) => (p === c ? p : c)); }
                const wi = loader.worldInfo?.();
                if (wi) setWorld((p) => (p.id === wi.id && p.nickname === wi.nickname ? p : wi));
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [loader]);

    return (
        <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-1.5 select-none">
            <button
                data-testid="mini-compass"
                onClick={onOpenMap}
                title="打开地图 · Map"
                className="relative flex items-center justify-center w-14 h-14 rounded-full bg-black/45 border border-white/12 backdrop-blur shadow-lg pointer-events-auto active:scale-95 transition-transform"
            >
                {/* fixed heading tick at the very top — "you face this way" */}
                <span className="absolute top-[3px] w-[2px] h-[5px] rounded-full bg-white/50" />
                {/* two-tone north-seeking needle */}
                <div ref={needle} className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-linear pointer-events-none">
                    <div className="flex flex-col items-center">
                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[13px] border-b-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.7)]" />
                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[13px] border-t-white/25" />
                    </div>
                </div>
                <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70 border border-black/30" />
                </span>
            </button>
            <div data-testid="mini-coord" className="px-2 py-0.5 rounded-lg bg-black/45 border border-white/10 backdrop-blur text-right leading-tight pointer-events-none">
                <div className="text-[11px] font-mono font-black text-cyan-200 tracking-tight">{coord}</div>
                <div className="text-[8px] font-mono text-cyan-400/45">
                    world {world.id}{world.nickname ? ` · ${world.nickname}` : ''}
                </div>
            </div>
        </div>
    );
}
