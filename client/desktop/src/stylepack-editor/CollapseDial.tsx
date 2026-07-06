import type { StylePack } from '@engine/core/spp/Variants';
import type { Faces } from './StylePackPreviewLoader';
import { FACE_NAMES, variantRef } from './constants';

/**
 * CollapseDial — floats at the bottom-centre of the 3D box. Each of the six faces
 * is: a name button (picks the face to edit), a 通/挡 state toggle, and an option
 * dropdown. It both SELECTS the face and SETS its collapse (which drives the live
 * preview) — the single face + state control.
 */
export function CollapseDial({ dial, pack, selFace, onSelectFace, onSetDialFace }: {
    dial: Faces;
    pack: StylePack;
    selFace: number;
    onSelectFace: (i: number) => void;
    onSetDialFace: (fi: number, state: number, ref: string) => void;
}) {
    return (
        <div data-testid="sp-dial" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-1 px-3 py-2 rounded-xl bg-black/70 border border-neutral-700 backdrop-blur-md shadow-2xl">
            <div className="self-center text-[9px] text-neutral-400 leading-tight mr-1">坍缩<br />控制盘</div>
            {FACE_NAMES.map((nm, fi) => {
                const [st, ref] = dial[fi];
                const options = (st === 0 ? pack.open : pack.closed) ?? [];
                const nextState = st === 0 ? 1 : 0;
                return (
                    <div key={fi} className={`flex flex-col items-center gap-0.5 w-[68px] rounded px-1 py-1 ${selFace === fi ? 'bg-cyan-500/15 ring-1 ring-cyan-400/50' : ''}`}>
                        <button data-testid={`sp-face-${fi}`} onClick={() => onSelectFace(fi)}
                            className={`text-[10px] font-bold ${selFace === fi ? 'text-cyan-200' : 'text-neutral-300 hover:text-cyan-200'}`}>{nm.split(' ')[0]}</button>
                        <button data-testid={`sp-dial-state-${fi}`}
                            onClick={() => onSetDialFace(fi, nextState, variantRef((nextState === 0 ? pack.open : pack.closed)[0], 0))}
                            className={`w-full py-0.5 rounded text-[10px] font-bold ${st === 0 ? 'bg-sky-500/30 text-sky-100' : 'bg-orange-500/30 text-orange-100'}`}>{st === 0 ? '通' : '挡'}</button>
                        <select data-testid={`sp-dial-var-${fi}`} value={String(ref)} onChange={(e) => onSetDialFace(fi, st, e.target.value)}
                            className="w-full px-0.5 py-0.5 rounded bg-black/60 border border-neutral-700 text-[9px] text-neutral-200 outline-none">
                            {options.map((v, i) => <option key={i} value={variantRef(v, i)}>{v.key ?? v.name}</option>)}
                        </select>
                    </div>
                );
            })}
        </div>
    );
}
