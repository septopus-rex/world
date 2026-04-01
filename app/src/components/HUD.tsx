import React, { forwardRef } from 'react';

export const Compass = forwardRef<HTMLDivElement>((_, ref) => {
    return (
        <div className="relative group mt-6 flex items-center justify-center w-32 h-32">
            <div className="absolute inset-2 rounded-full border border-white/10 border-dashed pointer-events-none"></div>
            <span className="absolute top-0 text-[10px] font-bold text-red-500/80 tracking-tighter shadow-sm">N</span>
            <span className="absolute bottom-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">S</span>
            <span className="absolute right-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">E</span>
            <span className="absolute left-0 text-[10px] font-bold text-gray-500/80 tracking-tighter">W</span>
            <div className="w-24 h-24 bg-gray-900/60 backdrop-blur-xl border-2 border-white/20 rounded-full flex items-center justify-center relative shadow-2xl transition-transform cursor-default">
                <div ref={ref} className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-linear pointer-events-none">
                    <div className="absolute top-1 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] border-b-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.8)]"></div>
                    <div className="absolute w-24 h-24 rounded-full bg-cyan-400/10" style={{ clipPath: 'polygon(50% 50%, 20% 0%, 80% 0%)' }}></div>
                </div>
                <div className="absolute w-1.5 h-1.5 bg-black rounded-full border border-white/50 z-10 shadow-lg"></div>
            </div>
        </div>
    );
});

export const TelemetryReadout = forwardRef<HTMLDivElement, { onClick: () => void }>(({ onClick }, ref) => {
    return (
        <div
            onClick={onClick}
            ref={ref}
            className="text-[10px] font-mono font-bold text-cyan-300 bg-black/60 border border-cyan-400/40 backdrop-blur-xl px-6 py-4 rounded-2xl mt-4 shadow-2xl cursor-pointer hover:border-cyan-400 transition-all text-center flex flex-col items-center gap-2 group min-w-[170px]"
        >
            <span className="text-[8px] text-cyan-500/50 font-bold uppercase tracking-[0.2em]">Live Telemetry</span>
            <span className="text-[13px] font-black tracking-wide">BLOCK [----, ----]</span>
            <span className="text-[11px] text-white font-bold">WORLD X:0.0 Y:0.0</span>
            <span className="text-[10px] text-cyan-400/90">REL X:0.0 Y:0.0 Z:0.0</span>
        </div>
    );
});
