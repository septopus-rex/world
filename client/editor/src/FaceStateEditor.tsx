import { useState, type ReactNode } from 'react';
import type { StylePack, FaceVariant, VariantPart, Prefab } from '@engine/core/spp/Variants';
import { checkOption, checkPrefab } from '@engine/core/spp/OptionGuard';
import { FaceState } from '@engine/core/types/ParticleCell';
import {
    FACE_NAMES, partKinds, prefabPartKinds,
    FACE_AXES, PREFAB_AXES, FACE_FRAME_HELP, PREFAB_FRAME_HELP,
} from './constants';
import { PartsEditor } from './PartsEditor';

type SectionId = 'basic' | 'face' | 'prefab' | 'store';

/** One accordion section: a clickable header + collapsible body. */
function Section({ id, title, hint, open, onToggle, children }: {
    id: SectionId; title: string; hint?: string; open: SectionId | null; onToggle: (id: SectionId) => void; children: ReactNode;
}) {
    const isOpen = open === id;
    return (
        <div className="border-b border-neutral-800">
            <button data-testid={`sp-acc-${id}`} onClick={() => onToggle(id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left ${isOpen ? 'bg-neutral-900' : 'hover:bg-neutral-900/50'}`}>
                <span className={`text-[10px] text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-[11px] font-bold text-neutral-200">{title}</span>
                {hint && <span className="text-[10px] text-neutral-600 ml-auto truncate">{hint}</span>}
            </button>
            {/* The body carries a handle so callers (and e2e) can tell "is this
                section open?" without reading class names. */}
            {isOpen && <div data-testid={`sp-sec-${id}`}>{children}</div>}
        </div>
    );
}

/**
 * FaceStateEditor — the right column, an ACCORDION of four sections:
 *   · 基本 Basic     — 粒子 meta (name/thickness) + pack library
 *   · 面选项 Face    — the selected face's state (通/挡, synced with the dial) → its
 *                     option variants → add adjuncts/geometry → the variant's parts
 *   · 组合件 Prefabs — named compositions that belong to NO face (§9): the same
 *                     parts editor, framed on the cell, placed by the world palette
 *   · 储存 Storage   — export JSON / publish CID
 * The face is picked in the collapse dial (or a 3D face); this column edits it.
 *
 * Face and prefab are mutually exclusive EDITING MODES, not two panels open at
 * once: the 3D preview can only show one thing, and an editor whose preview
 * disagrees with the panel is the failure §3.5 exists to prevent. Selecting a
 * prefab therefore switches the preview; picking a face switches it back.
 */
export function FaceStateEditor({
    pack, packs, selFace, selState, pool, vi, variant, selPrefab, prefab, cid, canUndo, canRedo,
    onEditPack, onSelectPack, onNewPack, onUndo, onRedo, onSetFaceState, onSetVariant, onAddVariant, onRemoveVariant, onRenameVariant,
    onSelectPrefab, onAddPrefab, onRemovePrefab, onRenamePrefab, onSetPrefabSize,
    onAddPart, onRemovePart, onSetPartField, onSetPart, onExport, onImport, onPublish,
}: {
    pack: StylePack;
    packs: StylePack[];
    selFace: number;
    selState: number;                 // 0 = 通 open, 1 = 挡 close (of the selected face)
    pool: FaceVariant[];
    vi: number;
    variant: FaceVariant | undefined;
    /** Key of the prefab being edited, or null = face mode. */
    selPrefab: string | null;
    prefab: Prefab | undefined;
    cid: string | null;
    canUndo: boolean;
    canRedo: boolean;
    onEditPack: (fn: (p: StylePack) => void) => void;
    onSelectPack: (p: StylePack) => void;
    onNewPack: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onSetFaceState: (state: number) => void;
    onSetVariant: (i: number) => void;
    onAddVariant: () => void;
    onRemoveVariant: (i: number) => void;
    onRenameVariant: (i: number, key: string) => void;
    /** null = leave prefab mode (back to the face). */
    onSelectPrefab: (key: string | null) => void;
    onAddPrefab: () => void;
    onRemovePrefab: (key: string) => void;
    onRenamePrefab: (key: string, next: string) => void;
    onSetPrefabSize: (key: string, meters: number) => void;
    onAddPart: (def: VariantPart) => void;
    onRemovePart: (pi: number) => void;
    onSetPartField: (pi: number, key: keyof VariantPart, val: any) => void;
    /** Replace a whole part — used by the type swap, which must change the raw
     *  tail and the type together or the row is left incoherent. */
    onSetPart: (pi: number, part: VariantPart) => void;
    onExport: () => void;
    onImport: (text: string) => string | null;
    onPublish: () => void;
}) {
    const [open, setOpen] = useState<SectionId | null>('face');
    const toggle = (id: SectionId) => {
        // Opening 面选项 while a 组合件 is on screen would show face parts next to a
        // preview of a bench — the exact panel/preview disagreement §3.5 forbids.
        // Expanding the section IS the request to look at faces again.
        if (id === 'face' && open !== 'face' && selPrefab !== null) onSelectPrefab(null);
        setOpen((cur) => (cur === id ? null : id));
    };
    const [importText, setImportText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);

    return (
        <div className="w-96 shrink-0 border-l border-neutral-800 flex flex-col min-h-0">
            <div className="p-3 border-b border-neutral-800 shrink-0 flex items-center justify-between">
                <div className="text-[11px] font-black tracking-widest text-cyan-400/80 uppercase">SPP 粒子编辑器</div>
                <div className="flex gap-1">
                    <button data-testid="sp-undo" onClick={onUndo} disabled={!canUndo} title="撤销 (⌘/Ctrl+Z)"
                        className="px-1.5 py-0.5 rounded text-[11px] bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800">↶</button>
                    <button data-testid="sp-redo" onClick={onRedo} disabled={!canRedo} title="重做 (⌘/Ctrl+⇧Z)"
                        className="px-1.5 py-0.5 rounded text-[11px] bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800">↷</button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
            {/* 基本 — 粒子 meta + pack library */}
            <Section id="basic" title="基本 Basic" hint={pack.id} open={open} onToggle={toggle}>
                <div className="p-2 space-y-1.5">
                    <label className="block text-[10px] text-neutral-500">名字 / id</label>
                    <input data-testid="sp-name" value={pack.id} onChange={(e) => onEditPack((n) => { n.id = e.target.value; })}
                        className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                    <label className="block text-[10px] text-neutral-500">尺寸 thickness</label>
                    <input data-testid="sp-thickness" type="number" step="0.05" value={pack.thickness ?? 0.2}
                        onChange={(e) => onEditPack((n) => { n.thickness = parseFloat(e.target.value) || 0; })}
                        className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                </div>
                <div className="p-2 pt-0">
                    <div className="text-[10px] text-neutral-500 mb-1">库 Packs（参考 · 点击预览）</div>
                    {packs.map((p) => (
                        <button key={p.id} data-testid={`sp-pack-${p.id}`} onClick={() => onSelectPack(p)}
                            className={`w-full text-left px-2 py-1 rounded mb-0.5 ${pack.id === p.id ? 'bg-cyan-500/20 text-cyan-100' : 'hover:bg-neutral-800 text-neutral-300'}`}>{p.id}{pack.id === p.id && <span className="text-cyan-400/70 ml-1">· 预览中</span>}</button>
                    ))}
                </div>
            </Section>

            {/* 面选项 — the selected face's state + option (parts) */}
            <Section id="face" title="面选项 Face" hint={`${FACE_NAMES[selFace]} · ${selState === 0 ? '通' : '挡'}`} open={open} onToggle={toggle}>
                <div className="p-2 border-b border-neutral-800/60">
                    <div className="text-[10px] text-neutral-500 mb-1">正在编辑 · 面 <span className="text-cyan-300 font-bold">{FACE_NAMES[selFace]}</span>（在坍缩盘点面切换）</div>
                    <div className="flex gap-1">
                        {([[0, 'open', '通 open'], [1, 'closed', '挡 close']] as const).map(([s, key, lbl]) => (
                            <button key={key} data-testid={`sp-tab-${key}`} onClick={() => onSetFaceState(s)}
                                className={`flex-1 px-2 py-1 rounded text-[11px] font-bold ${selState === s ? 'bg-amber-500/25 text-amber-100' : 'bg-neutral-800 text-neutral-400'}`}>{lbl}</button>
                        ))}
                    </div>
                </div>
                <div className="p-2 border-b border-neutral-800/60">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-500">{selState === 0 ? '通' : '挡'} 的 option 变体</span>
                        <button data-testid="sp-add-variant" onClick={onAddVariant} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">＋新</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {/* chip = 选它 + 删它。删按钮在最后一个 option 上禁用:池空了
                            这个 state 的面就没有造型可坍缩,是个死数据。 */}
                        {pool.map((v, i) => (
                            <span key={i} className={`inline-flex items-center rounded ${vi === i ? 'bg-cyan-500/25' : 'bg-neutral-800/60'}`}>
                                <button data-testid={`sp-variant-${i}`} onClick={() => onSetVariant(i)}
                                    className={`pl-2 py-0.5 text-[11px] ${vi === i ? 'text-cyan-100' : 'text-neutral-400'}`}>{v.key ?? v.name}</button>
                                <button data-testid={`sp-variant-del-${i}`} onClick={() => onRemoveVariant(i)} disabled={pool.length <= 1}
                                    title={pool.length <= 1 ? '至少保留一个 option' : '删除该 option'}
                                    className="px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-red-400 disabled:opacity-20 disabled:hover:text-neutral-500">×</button>
                            </span>
                        ))}
                    </div>
                </div>
                {/* option 改名:面引用 option 用的是 key(P4,稳定标识不是下标),所以
                    它必须能取成 `doorway`/`hedge` 这种语义名。此前面板没有入口,UI 新建
                    的 option 只能叫 v1/v2——导出的库因此永远带着一串没有含义的 key。 */}
                {variant && (
                    <div className="p-2 border-b border-neutral-800/60 flex items-center gap-2">
                        <label className="text-[10px] text-neutral-500 shrink-0">option 名 key</label>
                        <input data-testid="sp-variant-key" value={variant.key ?? variant.name ?? ''}
                            onChange={(e) => onRenameVariant(vi, e.target.value)}
                            className="flex-1 px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                    </div>
                )}
                <PartsEditor
                    parts={variant?.parts ?? []}
                    kinds={partKinds(pack.thickness ?? 0.2)}
                    thickness={pack.thickness ?? 0.2}
                    frameHelp={FACE_FRAME_HELP}
                    axisLabels={FACE_AXES}
                    issues={variant ? checkOption(variant, selState === 0 ? FaceState.Open : FaceState.Closed) : []}
                    onAddPart={onAddPart} onRemovePart={onRemovePart}
                    onSetPartField={onSetPartField} onSetPart={onSetPart}
                    emptyHint="空 option（通=可穿过）。加 part 来拼。" />
            </Section>

            {/* 组合件 — the same parts vocabulary, framed on the CELL, belonging to
                no face. This is the whole of §9 on the authoring side: a StylePack
                stops being "只能产弦粒子的面变体" and becomes a reusable library. */}
            <Section id="prefab" title="组合件 Prefabs" hint={selPrefab ? `编辑中 · ${selPrefab}` : `${(pack.prefabs ?? []).length} 个`} open={open} onToggle={toggle}>
                <div className="p-2 border-b border-neutral-800/60">
                    <div className="text-[10px] text-neutral-600 leading-snug mb-1.5">
                        与「放在哪」无关的可复用组合（长椅 / 树 / 阻挡花瓶）。世界里的编辑 palette 直接从这里取。
                    </div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-500">库里的组合件</span>
                        <button data-testid="sp-add-prefab" onClick={onAddPrefab} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">＋新</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(pack.prefabs ?? []).map((pf) => (
                            <span key={pf.key} className={`inline-flex items-center rounded ${selPrefab === pf.key ? 'bg-cyan-500/25' : 'bg-neutral-800/60'}`}>
                                <button data-testid={`sp-prefab-${pf.key}`} onClick={() => onSelectPrefab(pf.key)}
                                    className={`pl-2 py-0.5 text-[11px] ${selPrefab === pf.key ? 'text-cyan-100' : 'text-neutral-400'}`}>{pf.name || pf.key}</button>
                                <button data-testid={`sp-prefab-del-${pf.key}`} onClick={() => onRemovePrefab(pf.key)}
                                    title="删除该组合件" className="px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-red-400">×</button>
                            </span>
                        ))}
                        {!(pack.prefabs ?? []).length && <span className="text-[10px] text-neutral-600 italic">还没有组合件。</span>}
                    </div>
                    {selPrefab && (
                        <button data-testid="sp-prefab-back" onClick={() => onSelectPrefab(null)}
                            className="mt-1.5 w-full px-2 py-1 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300">‹ 回到面预览</button>
                    )}
                </div>
                {prefab && (
                    <>
                        <div className="p-2 border-b border-neutral-800/60 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-neutral-500 shrink-0">名 key</label>
                                <input data-testid="sp-prefab-key" value={prefab.key}
                                    onChange={(e) => onRenamePrefab(prefab.key, e.target.value)}
                                    className="flex-1 min-w-0 px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                            </div>
                            {/* size 不是装饰:单位帧是尺度无关的(§3.3),这个数字决定 1.0 在
                                世界里等于几米——也就是放下去的长椅到底是长椅还是纪念碑。 */}
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-neutral-500 shrink-0">尺寸 size（米）</label>
                                <input data-testid="sp-prefab-size" type="number" step="0.5" min="0.1" value={prefab.size ?? 2}
                                    onChange={(e) => onSetPrefabSize(prefab.key, parseFloat(e.target.value) || 0)}
                                    className="flex-1 min-w-0 px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                            </div>
                            <div className="text-[10px] text-neutral-600 font-mono">ref: {pack.id}#{prefab.key}</div>
                        </div>
                        <PartsEditor
                            parts={prefab.parts ?? []}
                            kinds={prefabPartKinds()}
                            thickness={pack.thickness ?? 0.2}
                            frameHelp={PREFAB_FRAME_HELP}
                            axisLabels={PREFAB_AXES}
                            issues={checkPrefab(prefab)}
                            onAddPart={onAddPart} onRemovePart={onRemovePart}
                            onSetPartField={onSetPartField} onSetPart={onSetPart}
                            emptyHint="空组合件——放进世界什么都不会出现。加 part 来拼。" />
                    </>
                )}
            </Section>

            {/* 储存 — export / publish */}
            <Section id="store" title="储存 Storage" hint={cid ? 'CID ✓' : undefined} open={open} onToggle={toggle}>
                <div className="p-2 space-y-2">
                    {cid && <div data-testid="sp-cid-store" className="text-[10px] text-cyan-300 font-mono break-all rounded bg-black/40 border border-neutral-800 px-2 py-1">CID: {cid}</div>}
                    <div className="flex gap-2">
                        <button data-testid="sp-export" onClick={onExport} className="flex-1 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 font-bold">导出 JSON</button>
                        <button data-testid="sp-publish" onClick={onPublish} className="flex-1 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold">Publish CID</button>
                    </div>
                    {/* 导入:贴一份 StylePack JSON(别人的库 / 工具或 AI 的产出)进来编。
                        同 id 覆盖库里那条,免得留下两个同名条目。 */}
                    <div className="pt-1 border-t border-neutral-800/60 space-y-1">
                        <label className="block text-[10px] text-neutral-500">导入 JSON（粘贴一份 StylePack）</label>
                        <textarea data-testid="sp-import-text" rows={3} value={importText}
                            onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                            placeholder='{"id":"my-pack","thickness":0.2,"closed":[…],"open":[…]}'
                            className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[10px] font-mono outline-none focus:border-cyan-700 resize-y" />
                        <button data-testid="sp-import-btn" disabled={!importText.trim()}
                            onClick={() => {
                                const err = onImport(importText);
                                setImportError(err);
                                if (!err) setImportText('');
                            }}
                            className="w-full px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 font-bold disabled:opacity-30">导入并编辑</button>
                        {importError && <div data-testid="sp-import-error" className="text-[10px] text-red-300 break-words">{importError}</div>}
                    </div>
                </div>
            </Section>
            </div>

            {/* New pack — a column-level action (creates a whole new 粒子), pinned
                at the bottom of the editing column. */}
            <div className="shrink-0 border-t border-neutral-800 p-2">
                <button data-testid="sp-new-pack" onClick={onNewPack}
                    className="w-full px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/40 text-cyan-100 font-bold">＋ 新建 pack</button>
            </div>
        </div>
    );
}
