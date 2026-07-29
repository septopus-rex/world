import { forwardRef, Ref } from 'react';

/**
 * Compass — heading dial that doubles as the entry point to the 3D region preview
 * (the satellite/orbital view). `ref` is the rotating needle (App's rAF spins it);
 * `coordRef` is the centre block-coord readout and `clockRef` the in-world time +
 * weather under it (both updated in place by the same loop, textContent only —
 * never innerHTML, which would recreate the node and eat clicks).
 *
 * The clock sits INSIDE the dial with the coordinate rather than in its own
 * corner: where-and-when is one question ("where/when am I"), and the dial was
 * already the place the player looks for it.
 */
export const Compass = forwardRef<HTMLDivElement, {
    onClick?: () => void;
    coordRef?: Ref<HTMLSpanElement>;
    clockRef?: Ref<HTMLSpanElement>;
}>(
    ({ onClick, coordRef, clockRef }, ref) => {
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
                    {/* Centre readout (App's rAF writes both): block coord, then the
                        in-world clock + weather. */}
                    <div className="flex flex-col items-center gap-[3px] pointer-events-none">
                        <span data-testid="compass-coord" ref={coordRef} className="text-[10px] font-mono font-black text-cyan-200 leading-none">--, --</span>
                        <span data-testid="compass-clock" ref={clockRef} className="text-[9px] font-mono font-bold text-cyan-300/55 leading-none tracking-tight">--:--</span>
                    </div>
                </div>
            </button>
        );
    },
);
