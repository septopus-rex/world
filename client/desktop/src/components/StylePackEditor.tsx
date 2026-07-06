import { useEffect, useRef, useState } from 'react';
import type { StylePack, FaceVariant, VariantPart } from '@engine/core/spp/Variants';
import { StylePackPreviewLoader, type Faces } from '../lib/StylePackPreviewLoader';
import { allStylePacks } from '../stylepacks';

/**
 * StylePackEditor — the standalone SPP粒子 (option library) editor (?tool=stylepack),
 * spatial model (spp-editors.md §3):
 *   ① a SPP 粒子 = a cell (name + thickness);
 *   ② main view = the cell, pick a face;
 *   ③ the picked face has two tabs [通 open / 挡 close];
 *   ④ under a state, add adjuncts / geometry to compose that option;
 *   ⑤ a collapse dial sets each face's state+option and drives the live preview.
 * Independent of the world app — drives its own lean Engine harness (path b).
 */

type Pool = 'open' | 'closed';
const FACE_NAMES = ['顶 Top', '底 Bottom', '前 S', '后 N', '左 W', '右 E'];
const variantRef = (v: FaceVariant, i: number): string => v.key ?? v.name ?? String(i);

// Part kinds you can drop into a state's option (geometry primitives + adjuncts).
const PART_KINDS: Array<{ label: string; def: VariantPart }> = [
    { label: '墙 a1', def: { type: 0x00a1, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] } },
    { label: '盒 a2', def: { type: 0x00a2, u: 0.3, v: 0.3, su: 0.4, sv: 0.4, sw: 0.4, props: [2, [1, 1], 0, 0] } },
    { label: '球 a7', def: { type: 0x00a7, u: 0.35, v: 0.35, su: 0.3, sv: 0.3, sw: 0.3, props: [0, [1, 1], 0, 0] } },
    { label: '模型 a4', def: { type: 0x00a4, u: 0.3, v: 0, su: 0.4, sv: 0.6, sw: 0.4, props: ['model.glb'] } },
    { label: '挡 b4', def: { type: 0x00b4, u: 0, v: 0, su: 1, sv: 1, sw: 0.2, props: [0, null] } },
];
const typeName = (t: number) => ({ 0x00a1: 'wall', 0x00a2: 'box', 0x00a7: 'ball', 0x00a4: 'model', 0x00b4: 'stop' } as any)[t] ?? `0x${t.toString(16)}`;

/** Lift any legacy `pieces` into a1 `parts` so the editor always edits parts. */
function liftPack(src: StylePack): StylePack {
    const p: StylePack = JSON.parse(JSON.stringify(src));
    for (const pool of ['open', 'closed'] as Pool[]) {
        (p[pool] ?? []).forEach((v) => {
            if (!v.parts && v.pieces) {
                v.parts = v.pieces.map((pc) => ({ type: 0x00a1, u: pc.du, v: pc.dv, su: pc.su, sv: pc.sv, props: [p.texture ?? 0, [1, 1], 0, 1] }));
                delete v.pieces;
            }
            if (!v.parts) v.parts = [];
        });
    }
    return p;
}

export default function StylePackEditor() {
    const [packs] = useState<StylePack[]>(() => allStylePacks());
    const [pack, setPack] = useState<StylePack>(() => liftPack(allStylePacks()[0]));
    const [selFace, setSelFace] = useState(0);
    const [tab, setTab] = useState<Pool>('closed');
    const [vi, setVi] = useState(0);                       // selected variant in the active tab's pool
    const [dial, setDial] = useState<Faces>(() => Array.from({ length: 6 }, () => [1, variantRef(liftPack(allStylePacks()[0]).closed[0], 0)] as [number, string]));
    const [cid, setCid] = useState<string | null>(null);
    const loaderRef = useRef<StylePackPreviewLoader | null>(null);

    // Boot the preview harness once.
    useEffect(() => {
        document.getElementById('init-loader')?.remove();
        const loader = new StylePackPreviewLoader();
        loaderRef.current = loader;
        (window as any).spLoader = loader;
        loader.init('sp-preview', pack, dial).catch(() => {});
        return () => loader.dispose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pool = pack[tab] ?? [];
    const variant = pool[vi];

    /** Commit an edited pack: update state + re-register in the preview. */
    const commit = (next: StylePack) => { setPack(next); setCid(null); loaderRef.current?.apply(next); };
    const editPack = (fn: (p: StylePack) => void) => { const n: StylePack = JSON.parse(JSON.stringify(pack)); fn(n); commit(n); };

    const selectPack = (p: StylePack) => {
        const lp = liftPack(p);
        setPack(lp); setTab('closed'); setVi(0); setCid(null);
        const d: Faces = Array.from({ length: 6 }, () => [1, variantRef(lp.closed[0], 0)] as [number, string]);
        setDial(d); loaderRef.current?.apply(lp); loaderRef.current?.setFaces(d);
    };

    const addPart = (def: VariantPart) => editPack((n) => { n[tab][vi].parts!.push(JSON.parse(JSON.stringify(def))); });
    const removePart = (pi: number) => editPack((n) => { n[tab][vi].parts!.splice(pi, 1); });
    const setPartField = (pi: number, key: keyof VariantPart, val: any) => editPack((n) => { (n[tab][vi].parts![pi] as any)[key] = val; });
    const addVariant = () => editPack((n) => { const k = `v${n[tab].length}`; n[tab].push({ key: k, name: k, parts: [] }); setVi(n[tab].length - 1); });

    // Collapse dial: set a face's [state, variantRef] and drive the preview.
    const setDialFace = (fi: number, state: number, ref: string) => {
        const d = dial.map((f, i) => (i === fi ? [state, ref] as [number, string] : f));
        setDial(d); loaderRef.current?.setFaces(d);
    };

    const exportPack = () => {
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${pack.id}.stylepack.json`; a.click(); URL.revokeObjectURL(a.href);
    };
    const publish = async () => {
        const router = (loaderRef.current?.getEngine() as any)?.ipfs; if (!router) return;
        setCid(await router.put(new TextEncoder().encode(JSON.stringify(pack))));
    };

    const faceState = dial[selFace]?.[0] ?? 1;
    return (
        <div data-testid="sp-editor" className="w-screen h-screen flex bg-neutral-950 text-neutral-100 font-sans overflow-hidden text-xs">
            {/* Left: 粒子 meta + packs + face picker */}
            <div className="w-56 shrink-0 border-r border-neutral-800 flex flex-col">
                <div className="p-3 border-b border-neutral-800">
                    <div className="text-[11px] font-black tracking-widest text-cyan-400/80 uppercase">SPP 粒子编辑器</div>
                </div>
                <div className="p-2 border-b border-neutral-800 space-y-1.5">
                    <label className="block text-[10px] text-neutral-500">名字 / id</label>
                    <input data-testid="sp-name" value={pack.id} onChange={(e) => editPack((n) => { n.id = e.target.value; })}
                        className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                    <label className="block text-[10px] text-neutral-500">尺寸 thickness</label>
                    <input data-testid="sp-thickness" type="number" step="0.05" value={pack.thickness ?? 0.2}
                        onChange={(e) => editPack((n) => { n.thickness = parseFloat(e.target.value) || 0; })}
                        className="w-full px-2 py-1 rounded bg-black/50 border border-neutral-800 text-[11px] outline-none focus:border-cyan-700" />
                </div>
                <div className="p-2 border-b border-neutral-800">
                    <div className="text-[10px] text-neutral-500 mb-1">库 Packs</div>
                    {packs.map((p) => (
                        <button key={p.id} data-testid={`sp-pack-${p.id}`} onClick={() => selectPack(p)}
                            className={`w-full text-left px-2 py-1 rounded mb-0.5 ${pack.id === p.id ? 'bg-cyan-500/20 text-cyan-100' : 'hover:bg-neutral-800 text-neutral-300'}`}>{p.id}</button>
                    ))}
                </div>
                <div className="p-2">
                    <div className="text-[10px] text-neutral-500 mb-1">选择面 pick a face</div>
                    <div className="grid grid-cols-2 gap-1">
                        {FACE_NAMES.map((nm, i) => (
                            <button key={i} data-testid={`sp-face-${i}`} onClick={() => { setSelFace(i); setTab(dial[i][0] === 0 ? 'open' : 'closed'); setVi(0); }}
                                className={`px-2 py-1 rounded text-[11px] ${selFace === i ? 'bg-emerald-500/25 text-emerald-100 font-bold' : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800'}`}>{nm}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Center: the 3D 粒子 preview */}
            <div className="flex-1 relative">
                <div id="sp-preview" data-testid="sp-preview" className="absolute inset-0 bg-neutral-900" />
                <div className="absolute top-3 left-3 text-[10px] text-neutral-500 pointer-events-none">SPP 粒子 · {pack.id} · 拖拽旋转 · W/S 缩放</div>
                {cid && <div data-testid="sp-cid" className="absolute bottom-3 left-3 text-[10px] text-cyan-300 font-mono">CID: {cid}</div>}
            </div>

            {/* Right: face editor (open/close tabs + parts) + collapse dial */}
            <div className="w-96 shrink-0 border-l border-neutral-800 flex flex-col">
                {/* Face state tabs */}
                <div className="p-2 border-b border-neutral-800">
                    <div className="text-[10px] text-neutral-500 mb-1">面 {FACE_NAMES[selFace]} 的状态</div>
                    <div className="flex gap-1">
                        {(['open', 'closed'] as Pool[]).map((pl) => (
                            <button key={pl} data-testid={`sp-tab-${pl}`} onClick={() => { setTab(pl); setVi(0); }}
                                className={`flex-1 px-2 py-1 rounded text-[11px] font-bold ${tab === pl ? 'bg-amber-500/25 text-amber-100' : 'bg-neutral-800 text-neutral-400'}`}>
                                {pl === 'open' ? '通 open' : '挡 close'}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Variants of the active pool */}
                <div className="p-2 border-b border-neutral-800">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-500">option 变体</span>
                        <button data-testid="sp-add-variant" onClick={addVariant} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">＋新</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {pool.map((v, i) => (
                            <button key={i} data-testid={`sp-variant-${i}`} onClick={() => setVi(i)}
                                className={`px-2 py-0.5 rounded text-[11px] ${vi === i ? 'bg-cyan-500/25 text-cyan-100' : 'bg-neutral-800/60 text-neutral-400'}`}>{v.key ?? v.name}</button>
                        ))}
                    </div>
                </div>
                {/* Parts editor */}
                <div className="p-2 border-b border-neutral-800">
                    <div className="text-[10px] text-neutral-500 mb-1">加 adjunct / 几何体</div>
                    <div className="flex flex-wrap gap-1">
                        {PART_KINDS.map((k, i) => (
                            <button key={i} data-testid={`sp-add-${typeName(k.def.type)}`} onClick={() => addPart(k.def)}
                                className="px-2 py-0.5 rounded text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-100">＋{k.label}</button>
                        ))}
                    </div>
                </div>
                <div data-testid="sp-parts" className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {(variant?.parts ?? []).map((pt, pi) => (
                        <div key={pi} className="rounded border border-neutral-800 bg-black/30 p-1.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-cyan-200 font-bold">{typeName(pt.type)}</span>
                                <button data-testid={`sp-part-del-${pi}`} onClick={() => removePart(pi)} className="text-[10px] text-red-400 hover:text-red-300">删</button>
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[10px]">
                                {(['u', 'v', 'su', 'sv', 'w', 'sw'] as const).map((f) => (
                                    <label key={f} className="flex flex-col text-neutral-500">
                                        {f}
                                        <input type="number" step="0.05" value={(pt as any)[f] ?? (f === 'w' ? 0 : f === 'sw' ? '' : 0)}
                                            onChange={(e) => setPartField(pi, f as any, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                            className="w-full px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-neutral-200 outline-none focus:border-cyan-700" />
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    {(!variant || (variant.parts ?? []).length === 0) && <div className="text-[10px] text-neutral-600 italic">空 option（通=可穿过）。加 part 来拼。</div>}
                </div>
                {/* Collapse dial */}
                <div className="p-2 border-t border-neutral-800">
                    <div className="text-[10px] text-neutral-500 mb-1">坍缩控制盘 collapse（驱动预览）</div>
                    <div className="space-y-0.5">
                        {FACE_NAMES.map((nm, fi) => {
                            const [st, ref] = dial[fi];
                            const options = (st === 0 ? pack.open : pack.closed) ?? [];
                            return (
                                <div key={fi} className="flex items-center gap-1">
                                    <span className="w-10 text-[10px] text-neutral-500">{nm}</span>
                                    <button data-testid={`sp-dial-state-${fi}`} onClick={() => setDialFace(fi, st === 0 ? 1 : 0, variantRef(((st === 0 ? 1 : 0) === 0 ? pack.open : pack.closed)[0], 0))}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${st === 0 ? 'bg-sky-500/25 text-sky-100' : 'bg-orange-500/25 text-orange-100'}`}>{st === 0 ? '通' : '挡'}</button>
                                    <select data-testid={`sp-dial-var-${fi}`} value={String(ref)} onChange={(e) => setDialFace(fi, st, e.target.value)}
                                        className="flex-1 px-1 py-0.5 rounded bg-black/50 border border-neutral-800 text-[10px] outline-none">
                                        {options.map((v, i) => <option key={i} value={variantRef(v, i)}>{v.key ?? v.name}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="flex gap-2 p-2 border-t border-neutral-800">
                    <button data-testid="sp-export" onClick={exportPack} className="flex-1 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 font-bold">导出 JSON</button>
                    <button data-testid="sp-publish" onClick={publish} className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold">Publish CID</button>
                </div>
            </div>
        </div>
    );
}
