import type { StylePack, FaceVariant, VariantPart } from '@engine/core/spp/Variants';
import { FACE_NAMES, PART_KINDS, typeName } from './constants';

/**
 * FaceStateEditor — the single merged control column, the DETAIL view of the face
 * selected in the collapse dial. Top: 粒子 meta + pack list. Then the selected
 * face's state (通/挡, synced with the dial — same source of truth) → the option
 * variants of that state → add adjuncts/geometry → the active variant's parts.
 * Bottom: export / publish.
 */
export function FaceStateEditor({
    pack, packs, selFace, selState, pool, vi, variant,
    onEditPack, onSelectPack, onSetFaceState, onSetVariant, onAddVariant, onAddPart, onRemovePart, onSetPartField, onExport, onPublish,
}: {
    pack: StylePack;
    packs: StylePack[];
    selFace: number;
    selState: number;                 // 0 = 通 open, 1 = 挡 close (of the selected face)
    pool: FaceVariant[];
    vi: number;
    variant: FaceVariant | undefined;
    onEditPack: (fn: (p: StylePack) => void) => void;
    onSelectPack: (p: StylePack) => void;
    onSetFaceState: (state: number) => void;
    onSetVariant: (i: number) => void;
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

            {/* Detail of the face selected in the dial: its 通/挡 state (synced). */}
            <div className="p-2 border-b border-neutral-800">
                <div className="text-[10px] text-neutral-500 mb-1">正在编辑 · 面 <span className="text-cyan-300 font-bold">{FACE_NAMES[selFace]}</span>（在坍缩盘点面切换）</div>
                <div className="flex gap-1">
                    {([[0, 'open', '通 open'], [1, 'closed', '挡 close']] as const).map(([s, key, lbl]) => (
                        <button key={key} data-testid={`sp-tab-${key}`} onClick={() => onSetFaceState(s)}
                            className={`flex-1 px-2 py-1 rounded text-[11px] font-bold ${selState === s ? 'bg-amber-500/25 text-amber-100' : 'bg-neutral-800 text-neutral-400'}`}>{lbl}</button>
                    ))}
                </div>
            </div>

            <div className="p-2 border-b border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-500">{selState === 0 ? '通' : '挡'} 的 option 变体</span>
                    <button data-testid="sp-add-variant" onClick={onAddVariant} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">＋新</button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {pool.map((v, i) => (
                        <button key={i} data-testid={`sp-variant-${i}`} onClick={() => onSetVariant(i)}
                            className={`px-2 py-0.5 rounded text-[11px] ${vi === i ? 'bg-cyan-500/25 text-cyan-100' : 'bg-neutral-800/60 text-neutral-400'}`}>{v.key ?? v.name}</button>
                    ))}
                </div>
            </div>

            <div className="p-2 border-b border-neutral-800">
                <div className="text-[10px] text-neutral-500 mb-1">给「{variant?.key ?? variant?.name ?? '—'}」加 adjunct / 几何体</div>
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
