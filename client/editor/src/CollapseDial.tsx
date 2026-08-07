import type { StylePack } from '@engine/core/spp/Variants';
import type { Faces } from './StylePackPreviewLoader';
import { FACE_NAMES, variantRef } from './constants';

/**
 * CollapseDial — the face control, floating at the bottom-centre of the box, in
 * TWO bands:
 *   · bottom — a row of six FACE selectors (name + a tiny 通/挡 state hint); click
 *     to select. The selected one is ringed.
 *   · top    — the SELECTED face's 通/挡 state + option dropdown. It refreshes to
 *     follow whichever face is picked, so only one face's controls show at a time
 *     (instead of all six at once).
 * Selecting a face and configuring its collapse are one coherent control; every
 * change drives the live preview.
 */
export function CollapseDial({ dial, pack, selFace, onSelectFace, onSetDialFace }: {
    dial: Faces;
    pack: StylePack;
    selFace: number;
    onSelectFace: (i: number) => void;
    onSetDialFace: (fi: number, state: number, ref: string) => void;
}) {
    const [selState, selRef] = dial[selFace] ?? [1, ''];
    const options = (selState === 0 ? pack.open : pack.closed) ?? [];

    return (
        <div data-testid="sp-dial" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-black/75 border border-neutral-700 backdrop-blur-md shadow-2xl">
            {/* Top band — the selected face's state + option (follows the selection) */}
            <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] text-neutral-400">面 <span className="text-cyan-200 font-bold">{FACE_NAMES[selFace]?.split(' ')[0]}</span></span>
                <div className="flex gap-0.5">
                    {([[0, '通'], [1, '挡']] as const).map(([s, lbl]) => (
                        <button key={s} data-testid={s === 0 ? 'sp-dial-state-open' : 'sp-dial-state-closed'}
                            onClick={() => onSetDialFace(selFace, s, variantRef((s === 0 ? pack.open : pack.closed)[0], 0))}
                            className={`px-3 py-0.5 rounded text-[11px] font-bold ${selState === s ? (s === 0 ? 'bg-sky-500/50 text-sky-50' : 'bg-orange-500/50 text-orange-50') : 'bg-neutral-800/80 text-neutral-500 hover:text-neutral-300'}`}>{lbl}</button>
                    ))}
                </div>
                <select data-testid="sp-dial-opt" value={String(selRef)} onChange={(e) => onSetDialFace(selFace, selState, e.target.value)}
                    className="px-1.5 py-0.5 rounded bg-black/60 border border-neutral-700 text-[10px] text-neutral-200 outline-none min-w-[96px]">
                    {options.map((v, i) => <option key={i} value={variantRef(v, i)}>{v.key ?? v.name}</option>)}
                </select>
            </div>

            {/* Bottom band — the six face selectors */}
            <div className="flex items-stretch gap-1">
                <span className="self-center text-[9px] text-neutral-500 leading-tight mr-0.5">坍缩盘<br />选面</span>
                {FACE_NAMES.map((nm, fi) => {
                    const st = dial[fi]?.[0] ?? 1;
                    const sel = selFace === fi;
                    return (
                        <button key={fi} data-testid={`sp-face-${fi}`} onClick={() => onSelectFace(fi)}
                            className={`flex flex-col items-center w-[52px] rounded px-1 py-1 transition ${sel ? 'bg-cyan-500/20 ring-2 ring-cyan-400' : 'bg-white/5 hover:bg-white/10'}`}>
                            <span className={`text-[12px] font-bold leading-none ${sel ? 'text-cyan-100' : 'text-neutral-200'}`}>{nm.split(' ')[0]}</span>
                            <span className={`text-[9px] font-bold leading-tight mt-0.5 ${st === 0 ? 'text-sky-300' : 'text-orange-300'}`}>{st === 0 ? '通' : '挡'}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
