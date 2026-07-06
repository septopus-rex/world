import type { StylePack } from '@engine/core/spp/Variants';
import type { Faces } from './StylePackPreviewLoader';
import { FACE_NAMES, variantRef } from './constants';

/**
 * CollapseDial — the SINGLE face control, floating at the bottom-centre of the box.
 * Each face is a card: click anywhere on it to SELECT it (the right column then
 * edits its option); a segmented 通/挡 sets the state; a dropdown sets the option.
 * Every interaction selects the face + drives the live preview — selection and
 * state-config are one coherent control. The selected face is ringed.
 */
export function CollapseDial({ dial, pack, selFace, onSelectFace, onSetDialFace }: {
    dial: Faces;
    pack: StylePack;
    selFace: number;
    onSelectFace: (i: number) => void;
    onSetDialFace: (fi: number, state: number, ref: string) => void;
}) {
    return (
        <div data-testid="sp-dial" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-1.5 px-3 py-2 rounded-xl bg-black/75 border border-neutral-700 backdrop-blur-md shadow-2xl">
            <div className="self-center text-[9px] text-neutral-400 leading-tight mr-1">坍缩盘<br />点面选中</div>
            {FACE_NAMES.map((nm, fi) => {
                const [st, ref] = dial[fi];
                const options = (st === 0 ? pack.open : pack.closed) ?? [];
                const sel = selFace === fi;
                return (
                    <div key={fi} onClick={() => onSelectFace(fi)}
                        className={`flex flex-col gap-1 w-[72px] rounded-md px-1.5 pt-1 pb-1.5 cursor-pointer transition ${sel ? 'bg-cyan-500/20 ring-2 ring-cyan-400' : 'bg-white/5 hover:bg-white/10'}`}>
                        <div data-testid={`sp-face-${fi}`} className={`text-center text-[11px] font-bold ${sel ? 'text-cyan-100' : 'text-neutral-200'}`}>{nm.split(' ')[0]}</div>
                        {/* segmented 通 / 挡 — active state highlighted */}
                        <div className="flex gap-0.5">
                            {([[0, '通'], [1, '挡']] as const).map(([s, lbl]) => (
                                <button key={s} {...(s === 0 ? { 'data-testid': `sp-dial-state-${fi}` } : {})}
                                    onClick={() => onSetDialFace(fi, s, variantRef((s === 0 ? pack.open : pack.closed)[0], 0))}
                                    className={`flex-1 py-0.5 rounded text-[10px] font-bold ${st === s ? (s === 0 ? 'bg-sky-500/50 text-sky-50' : 'bg-orange-500/50 text-orange-50') : 'bg-neutral-800/80 text-neutral-500 hover:text-neutral-300'}`}>{lbl}</button>
                            ))}
                        </div>
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
