import { useEffect, useRef, useState } from 'react';
import type { StylePack, VariantPart } from '@engine/core/spp/Variants';
import { allStylePacks } from '../stylepacks';
import type { Faces } from './StylePackPreviewLoader';
import { usePreviewLoader } from './usePreviewLoader';
import { PreviewPane } from './PreviewPane';
import { FaceStateEditor } from './FaceStateEditor';
import { type Pool, liftPack, variantRef, defaultDial } from './constants';

/**
 * StylePackEditor — the standalone SPP粒子 (option library) editor (?tool=stylepack),
 * spatial model (spp-editors.md §3): a SPP 粒子 = a cell; the main 3D view is the
 * cell with a collapse dial (pick a face + set its 通/挡 state + option); the right
 * column edits the picked face's option (add adjuncts/geometry). Independent of the
 * world app — its own lean Engine harness (path b).
 *
 * This file is the ORCHESTRATOR: state + data ops. Presentation is split into
 * PreviewPane / CollapseDial / FaceStateEditor; the preview harness into
 * usePreviewLoader; constants/helpers into constants.ts.
 */
export default function StylePackEditor() {
    const [packs] = useState<StylePack[]>(() => allStylePacks());
    const [pack, setPack] = useState<StylePack>(() => liftPack(allStylePacks()[0]));
    const [selFace, setSelFace] = useState(0);
    const [tab, setTab] = useState<Pool>('closed');
    const [vi, setVi] = useState(0); // selected variant in the active tab's pool
    const [dial, setDial] = useState<Faces>(() => defaultDial(liftPack(allStylePacks()[0])));
    const [cid, setCid] = useState<string | null>(null);

    const selFaceRef = useRef(0);
    useEffect(() => { selFaceRef.current = selFace; }, [selFace]);
    const { loaderRef, labels, hl } = usePreviewLoader(pack, dial, selFaceRef);

    const pool = pack[tab] ?? [];
    const variant = pool[vi];

    // ── data ops ─────────────────────────────────────────────────────────────
    const commit = (next: StylePack) => { setPack(next); setCid(null); loaderRef.current?.apply(next); };
    const editPack = (fn: (p: StylePack) => void) => { const n: StylePack = JSON.parse(JSON.stringify(pack)); fn(n); commit(n); };

    const selectPack = (p: StylePack) => {
        const lp = liftPack(p);
        setPack(lp); setTab('closed'); setVi(0); setCid(null);
        const d = defaultDial(lp);
        setDial(d); loaderRef.current?.apply(lp); loaderRef.current?.setFaces(d);
    };

    const addPart = (def: VariantPart) => editPack((n) => { n[tab][vi].parts!.push(JSON.parse(JSON.stringify(def))); });
    const removePart = (pi: number) => editPack((n) => { n[tab][vi].parts!.splice(pi, 1); });
    const setPartField = (pi: number, key: keyof VariantPart, val: any) => editPack((n) => { (n[tab][vi].parts![pi] as any)[key] = val; });
    const addVariant = () => editPack((n) => { const k = `v${n[tab].length}`; n[tab].push({ key: k, name: k, parts: [] }); setVi(n[tab].length - 1); });

    /** Pick a face to edit (from the dial or a 3D label): sync the tab to its state. */
    const selectFace = (i: number) => { setSelFace(i); setTab(dial[i][0] === 0 ? 'open' : 'closed'); setVi(0); };

    /** Set a face's [state, variantRef] in the dial and drive the preview. */
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

    return (
        <div data-testid="sp-editor" className="w-screen h-screen flex bg-neutral-950 text-neutral-100 font-sans overflow-hidden text-xs">
            <PreviewPane packId={pack.id} cid={cid} labels={labels} hl={hl} selFace={selFace} dial={dial} pack={pack}
                onSelectFace={selectFace} onSetDialFace={setDialFace} />
            <FaceStateEditor pack={pack} packs={packs} selFace={selFace} tab={tab} vi={vi} pool={pool} variant={variant}
                onEditPack={editPack} onSelectPack={selectPack} onSetTab={(pl) => { setTab(pl); setVi(0); }} onSetVi={setVi}
                onAddVariant={addVariant} onAddPart={addPart} onRemovePart={removePart} onSetPartField={setPartField}
                onExport={exportPack} onPublish={publish} />
        </div>
    );
}
