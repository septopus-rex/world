import { forwardRef, Ref } from 'react';

/**
 * Compass — heading dial that doubles as the entry point to the 3D region preview
 * (the satellite/orbital view). `ref` is the rotating needle (App's rAF spins it);
 * `coordRef` is the centre block-coord readout (updated in place by the same loop,
 * textContent only — never innerHTML, which would recreate the node and eat clicks).
 */
export const Compass = forwardRef<HTMLDivElement, { onClick?: () => void; coordRef?: Ref<HTMLSpanElement> }>(
    ({ onClick, coordRef }, ref) => {
        return (
            <button
                onClick={onClick}
                title="打开 3D 区域预览 · Satellite view"
                className="relative group mt-2 flex items-center justify-center w-28 h-28 pointer-events-auto select-none"
            >
                <div className="absolute inset-2 rounded-full border border-white/10 border-dashed pointer-events-none"></div>
                <span className="absolute top-0 text-[10px] font-bold text-red-500/80 tracking-tighter">N</span>
                <span className="absolute bottom-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">S</span>
                <span className="absolute right-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">E</span>
                <span className="absolute left-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">W</span>
                <div className="w-24 h-24 bg-gray-900/60 backdrop-blur-xl border-2 border-white/20 rounded-full flex items-center justify-center relative shadow-2xl group-hover:border-cyan-400/50 transition-colors">
                    <div ref={ref} className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-linear pointer-events-none">
                        <div className="absolute top-1 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] border-b-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.8)]"></div>
                    </div>
                    {/* Centre block-coord readout (App's rAF writes it). */}
                    <span ref={coordRef} className="text-[10px] font-mono font-black text-cyan-200 leading-none pointer-events-none">--, --</span>
                </div>
            </button>
        );
    },
);
