import type { StylePack, FaceVariant, VariantPart } from '@engine/core/spp/Variants';
import { FACE_NAMES, PART_KINDS, typeName, type Pool } from './constants';

/**
 * FaceStateEditor — the single merged control column. Top: 粒子 meta (name/thickness)
 * + pack list. Then the SELECTED face's state editor: 通/挡 tabs → option variants →
 * add adjuncts/geometry → the active variant's parts (structured fields). Bottom:
 * export / publish. The face is picked in the collapse dial (or a 3D label).
 */
export function FaceStateEditor({
    pack, packs, selFace, tab, vi, pool, variant,
    onEditPack, onSelectPack, onSetTab, onSetVi, onAddVariant, onAddPart, onRemovePart, onSetPartField, onExport, onPublish,
}: {
    pack: StylePack;
    packs: StylePack[];
    selFace: number;
    tab: Pool;
    vi: number;
    pool: FaceVariant[];
    variant: FaceVariant | undefined;
    onEditPack: (fn: (p: StylePack) => void) => void;
    onSelectPack: (p: StylePack) => void;
    onSetTab: (pl: Pool) => void;
    onSetVi: (i: number) => void;
    onAddVariant: () => void;
    onAddPart: (def: VariantPart) => void;
    onRemovePart: (pi: number) => void;
    onSetPartField: (pi: number, key: keyof VariantPart, val: any) => void;
    onExport: () => void;
    onPublish: () => void;
}) {
    return (
        <div className="w-96 shrink-0 border-l border-neutral-800 flex flex-col min-h-0 overflow-y-auto">
            <div className="p-3 border-b border-neutral-800">
                <div className="text-[11px] font-black tracking-widest text-cyan-400/80 uppercase">SPP 粒子编辑器</div>
            </div>

            <div className="p-2 border-b border-neutral-800 space-y-1.5">
                <label className="block text-[10px] text-neutral-500">名字 / id</label>
                <input data-testid="sp-name" value={pack.id} onChange={(e) => onEditPack((n) => { n.id = e.target.value; })}
                    className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                <label className="block text-[10px] text-neutral-500">尺寸 thickness</label>
                <input data-testid="sp-thickness" type="number" step="0.05" value={pack.thickness ?? 0.2}
                    onChange={(e) => onEditPack((n) => { n.thickness = parseFloat(e.target.value) || 0; })}
                    className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
            </div>

            <div className="p-2 border-b border-neutral-800">
                <div className="text-[10px] text-neutral-500 mb-1">库 Packs</div>
                {packs.map((p) => (
                    <button key={p.id} data-testid={`sp-pack-${p.id}`} onClick={() => onSelectPack(p)}
                        className={`w-full text-left px-2 py-1 rounded mb-0.5 ${pack.id === p.id ? 'bg-cyan-500/20 text-cyan-100' : 'hover:bg-neutral-800 text-neutral-300'}`}>{p.id}</button>
                ))}
            </div>

            {/* Selected face's state editor (face picked in the collapse dial / a 3D label). */}
            <div className="p-2 border-b border-neutral-800">
                <div className="text-[10px] text-neutral-500 mb-1">面 <span className="text-cyan-300 font-bold">{FACE_NAMES[selFace]}</span> 的状态（在坍缩盘或 3D 上点面切换）</div>
                <div className="flex gap-1">
                    {(['open', 'closed'] as Pool[]).map((pl) => (
                        <button key={pl} data-testid={`sp-tab-${pl}`} onClick={() => onSetTab(pl)}
                            className={`flex-1 px-2 py-1 rounded text-[11px] font-bold ${tab === pl ? 'bg-amber-500/25 text-amber-100' : 'bg-neutral-800 text-neutral-400'}`}>
                            {pl === 'open' ? '通 open' : '挡 close'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-2 border-b border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-500">option 变体</span>
                    <button data-testid="sp-add-variant" onClick={onAddVariant} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">＋新</button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {pool.map((v, i) => (
                        <button key={i} data-testid={`sp-variant-${i}`} onClick={() => onSetVi(i)}
                            className={`px-2 py-0.5 rounded text-[11px] ${vi === i ? 'bg-cyan-500/25 text-cyan-100' : 'bg-neutral-800/60 text-neutral-400'}`}>{v.key ?? v.name}</button>
                    ))}
                </div>
            </div>

            <div className="p-2 border-b border-neutral-800">
                <div className="text-[10px] text-neutral-500 mb-1">加 adjunct / 几何体</div>
                <div className="flex flex-wrap gap-1">
                    {PART_KINDS.map((k, i) => (
                        <button key={i} data-testid={`sp-add-${typeName(k.def.type)}`} onClick={() => onAddPart(k.def)}
                            className="px-2 py-0.5 rounded text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-100">＋{k.label}</button>
                    ))}
                </div>
            </div>

            <div data-testid="sp-parts" className="flex-1 p-2 space-y-1.5">
                {(variant?.parts ?? []).map((pt, pi) => (
                    <div key={pi} className="rounded border border-neutral-800 bg-black/30 p-1.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-cyan-200 font-bold">{typeName(pt.type)}</span>
                            <button data-testid={`sp-part-del-${pi}`} onClick={() => onRemovePart(pi)} className="text-[10px] text-red-400 hover:text-red-300">删</button>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[10px]">
                            {(['u', 'v', 'su', 'sv', 'w', 'sw'] as const).map((f) => (
                                <label key={f} className="flex flex-col text-neutral-500">
                                    {f}
                                    <input type="number" step="0.05" value={(pt as any)[f] ?? (f === 'w' ? 0 : f === 'sw' ? '' : 0)}
                                        onChange={(e) => onSetPartField(pi, f, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                        className="w-full px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-neutral-200 outline-none focus:border-cyan-700" />
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
                {(!variant || (variant.parts ?? []).length === 0) && <div className="text-[10px] text-neutral-600 italic">空 option（通=可穿过）。加 part 来拼。</div>}
            </div>

            <div className="flex gap-2 p-2 border-t border-neutral-800 mt-auto">
                <button data-testid="sp-export" onClick={onExport} className="flex-1 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 font-bold">导出 JSON</button>
                <button data-testid="sp-publish" onClick={onPublish} className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold">Publish CID</button>
            </div>
        </div>
    );
}
