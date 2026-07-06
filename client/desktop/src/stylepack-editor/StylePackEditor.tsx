import { useEffect, useState } from 'react';
import type { StylePack, VariantPart } from '@engine/core/spp/Variants';
import { allStylePacks } from '../stylepacks';
import type { Faces } from './StylePackPreviewLoader';
import { usePreviewLoader } from './usePreviewLoader';
import { PreviewPane } from './PreviewPane';
import { FaceStateEditor } from './FaceStateEditor';
import { type Pool, liftPack, variantRef, defaultDial } from './constants';

/**
 * StylePackEditor — the standalone SPP粒子 (option library) editor (?tool=stylepack).
 * Spatial model (spp-editors.md §3): a SPP 粒子 = a cell; the collapse DIAL is the
 * SINGLE control for every face's [selected · 通/挡 state · option], and drives the
 * live preview. The right column edits the SELECTED face's current option.
 *
 * The dial (via `selFace` + `dial`) is the single source of truth: the edited
 * pool/variant are DERIVED from the selected face's dial entry — no separate
 * tab/variant state to drift out of sync.
 */
export default function StylePackEditor() {
    const [packs] = useState<StylePack[]>(() => allStylePacks());
    const [pack, setPack] = useState<StylePack>(() => liftPack(allStylePacks()[0]));
    const [selFace, setSelFace] = useState(0);
    const [dial, setDial] = useState<Faces>(() => defaultDial(liftPack(allStylePacks()[0])));
    const [cid, setCid] = useState<string | null>(null);

    const { loaderRef, labels, faces } = usePreviewLoader(pack, dial);
    // Highlight the selected face on the in-scene panels (recolour, zero lag).
    useEffect(() => { loaderRef.current?.setHighlightFace?.(selFace); }, [loaderRef, selFace]);

    // ── derived: the selected face's [state, variant] IS what we edit ─────────
    const [selState, selRef] = dial[selFace] ?? [1, variantRef(pack.closed[0], 0)];
    const tab: Pool = selState === 0 ? 'open' : 'closed';
    const pool = pack[tab] ?? [];
    const viFound = pool.findIndex((v, i) => variantRef(v, i) === String(selRef));
    const vi = viFound >= 0 ? viFound : 0;
    const variant = pool[vi];

    // ── low-level mutators ────────────────────────────────────────────────────
    const commit = (next: StylePack) => { setPack(next); setCid(null); loaderRef.current?.apply(next); };
    const editPack = (fn: (p: StylePack) => void) => { const n: StylePack = JSON.parse(JSON.stringify(pack)); fn(n); commit(n); };
    const setFaces = (d: Faces) => { setDial(d); loaderRef.current?.setFaces(d); };
    const setDialFace = (fi: number, state: number, ref: string) => setFaces(dial.map((f, i) => (i === fi ? [state, ref] as [number, string] : f)));

    // ── dial-driven selection/state (the single source of truth) ──────────────
    const selectFace = (fi: number) => setSelFace(fi);
    /** Set a face's state + pick that state's first option; also selects the face. */
    const setFaceState = (fi: number, state: number) => {
        setSelFace(fi);
        setDialFace(fi, state, variantRef((state === 0 ? pack.open : pack.closed)[0], 0));
    };
    /** Point the SELECTED face at variant `i` of its current pool (also edits it). */
    const setVariant = (i: number) => setDialFace(selFace, selState, variantRef(pool[i], i));
    /** Any dial interaction on a face selects it + applies. */
    const dialFace = (fi: number, state: number, ref: string) => { setSelFace(fi); setDialFace(fi, state, ref); };

    const selectPack = (p: StylePack) => {
        const lp = liftPack(p);
        setPack(lp); setSelFace(0); setCid(null);
        const d = defaultDial(lp);
        setDial(d); loaderRef.current?.apply(lp); loaderRef.current?.setFaces(d);
    };

    // ── option (variant) editing — targets the selected face's variant ────────
    const addPart = (def: VariantPart) => editPack((n) => { n[tab][vi].parts!.push(JSON.parse(JSON.stringify(def))); });
    const removePart = (pi: number) => editPack((n) => { n[tab][vi].parts!.splice(pi, 1); });
    const setPartField = (pi: number, key: keyof VariantPart, val: any) => editPack((n) => { (n[tab][vi].parts![pi] as any)[key] = val; });
    const addVariant = () => {
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        const k = `v${n[tab].length}`; n[tab].push({ key: k, name: k, parts: [] });
        commit(n);
        setDialFace(selFace, selState, k); // point the selected face at (and edit) the new variant
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
            <PreviewPane packId={pack.id} cid={cid} labels={labels} faces={faces} selFace={selFace} dial={dial} pack={pack}
                onSelectFace={selectFace} onSetDialFace={dialFace} />
            <FaceStateEditor pack={pack} packs={packs} selFace={selFace} selState={selState} pool={pool} vi={vi} variant={variant}
                onEditPack={editPack} onSelectPack={selectPack} onSetFaceState={(state) => setFaceState(selFace, state)}
                onSetVariant={setVariant} onAddVariant={addVariant} onAddPart={addPart} onRemovePart={removePart}
                onSetPartField={setPartField} onExport={exportPack} onPublish={publish} />
        </div>
    );
}
