import type { VariantPart } from '@engine/core/spp/Variants';
import type { OptionIssue } from '@engine/core/spp/OptionGuard';
import { typeName, MATERIALS, takesMaterial, retypePart } from './constants';

/**
 * PartsEditor — "a list of adjuncts in a unit frame", the ONE editing surface
 * this tool really has.
 *
 * Both things the editor authors are that same list (spp-editors.md §9): a face
 * option is one framed on a face, a 组合件 is one framed on the cell. Keeping a
 * single component is not tidiness — a second copy would drift, and the drift
 * would be silent (an author's pack quietly loses a material picker in one of
 * the two places). The frame LABELS differ, because u/v/w mean different axes
 * in the two frames and mislabelling them is how a bench ends up lying on its
 * side; everything else is identical.
 */
export function PartsEditor({ parts, kinds, thickness, frameHelp, axisLabels, issues, onAddPart, onRemovePart, onSetPartField, onSetPart, emptyHint }: {
    parts: VariantPart[];
    /** Droppable part kinds, already framed for THIS frame (face vs cell). Both
     *  lists come from the engine's `listOptionPartKinds` — see constants.ts. */
    kinds: Array<{ label: string; def: VariantPart }>;
    /** Only used to re-seed a part's tail on a type swap. */
    thickness: number;
    /** One line explaining what the frame's axes mean here. */
    frameHelp: string;
    /** Per-field labels for u/v/su/sv/w/sw, in that order. */
    axisLabels: [string, string, string, string, string, string];
    issues: OptionIssue[];
    onAddPart: (def: VariantPart) => void;
    onRemovePart: (pi: number) => void;
    onSetPartField: (pi: number, key: keyof VariantPart, val: any) => void;
    /** Replace a whole part — used by the type swap, which must change the raw
     *  tail and the type together or the row is left incoherent. */
    onSetPart: (pi: number, part: VariantPart) => void;
    emptyHint: string;
}) {
    return (
        <>
            <div className="p-2 border-b border-neutral-800/60">
                <div className="text-[10px] text-neutral-500 mb-1">加 adjunct / 几何体</div>
                <div className="flex flex-wrap gap-1">
                    {kinds.map((k, i) => (
                        <button key={i} data-testid={`sp-add-${typeName(k.def.type)}`} onClick={() => onAddPart(k.def)}
                            className="px-2 py-0.5 rounded text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-100">＋{k.label}</button>
                    ))}
                </div>
            </div>
            {/* 契约守卫(§3.7):只报客观错误——伸出单位胞、零尺寸、挡不住的「挡」、
                过不去的「通」、共面闪烁。提示不硬拦:是否采纳由作者定。好看不好看
                不在这里判,那是预览的事。 */}
            {issues.length > 0 && (
                <div data-testid="sp-guard" className="px-2 pt-2 space-y-1">
                    {issues.map((iss, i) => (
                        <div key={i} data-testid={`sp-guard-${iss.code}`}
                            className={`text-[10px] leading-snug rounded px-2 py-1 border ${iss.level === 'error'
                                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
                            <span className="font-bold mr-1">{iss.level === 'error' ? '错' : '注意'}</span>
                            {iss.message}
                        </div>
                    ))}
                </div>
            )}
            <div data-testid="sp-parts" className="p-2 space-y-1.5">
                <div className="text-[10px] text-neutral-600 leading-snug">{frameHelp}</div>
                {parts.map((pt, pi) => (
                    <div key={pi} className="rounded border border-neutral-800 bg-black/30 p-1.5">
                        <div className="flex items-center justify-between mb-1 gap-1">
                            {/* 换型换的是 raw 尾巴,不是位置——所以 frame 留着、props 整条
                                换成新型的起始尾巴(retypePart)。把 a4 的 [modelId] 当
                                a2 的 [色,repeat,…] 解释是纯粹的坏数据。 */}
                            <select data-testid={`sp-part-${pi}-type`} value={pt.type}
                                onChange={(e) => onSetPart(pi, retypePart(pt, Number(e.target.value), thickness))}
                                className="flex-1 min-w-0 px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-[11px] text-cyan-200 font-bold outline-none focus:border-cyan-700">
                                {kinds.map((k) => (
                                    <option key={k.def.type} value={k.def.type}>{k.label}</option>
                                ))}
                            </select>
                            <button data-testid={`sp-part-del-${pi}`} onClick={() => onRemovePart(pi)} className="text-[10px] text-red-400 hover:text-red-300 shrink-0 px-1">删</button>
                        </div>
                        {/* 材质:raw 槽 3。只对标准 7 槽型开放(PALETTE_SLOT3_TYPES)——
                            a4 那里放的是模型 id、a8 是贴图、b4 是 stopMode,给它们塞
                            颜色是静默写坏一行。调色板项自带 roughness/metalness,所以
                            「选钢」连金属度一起给了,这正是层次感的来源。 */}
                        {takesMaterial(pt.type) && (
                            <div className="flex items-center gap-1 mb-1">
                                <span className="w-3 h-3 rounded-sm border border-neutral-700 shrink-0"
                                    style={{ background: MATERIALS.find((m) => m.value === (pt.props?.[0] ?? 0))?.color ?? '#888' }} />
                                <select data-testid={`sp-part-${pi}-material`} value={Number(pt.props?.[0] ?? 0)}
                                    onChange={(e) => {
                                        const next = [...(pt.props ?? [])];
                                        next[0] = Number(e.target.value);
                                        onSetPartField(pi, 'props', next);
                                    }}
                                    className="flex-1 min-w-0 px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-[10px] text-neutral-200 outline-none focus:border-cyan-700">
                                    {MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                            {(['u', 'v', 'su', 'sv', 'w', 'sw'] as const).map((f, fi) => (
                                <label key={f} className="flex flex-col text-neutral-500">
                                    {axisLabels[fi]}
                                    <input data-testid={`sp-part-${pi}-${f}`} type="number" step="0.05"
                                        value={(pt as any)[f] ?? (f === 'w' ? 0 : f === 'sw' ? '' : 0)}
                                        onChange={(e) => onSetPartField(pi, f, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                        className="w-full px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-neutral-200 outline-none focus:border-cyan-700" />
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
                {parts.length === 0 && <div className="text-[10px] text-neutral-600 italic">{emptyHint}</div>}
            </div>
        </>
    );
}
