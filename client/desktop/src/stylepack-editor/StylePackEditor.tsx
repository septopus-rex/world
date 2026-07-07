import { useEffect, useRef, useState } from 'react';
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
/** The pack the editor opens on — garden by default (fallback to the first). */
const DEFAULT_PACK = 'garden';
function openingPack(): StylePack {
    const all = allStylePacks();
    return liftPack(all.find((p) => p.id === DEFAULT_PACK) ?? all[0]);
}

/** An undo/redo snapshot of the editable document (pack + preview dial + library). */
type Snapshot = { pack: StylePack; dial: Faces; packs: StylePack[] };

export default function StylePackEditor() {
    const [packs, setPacks] = useState<StylePack[]>(() => allStylePacks());
    const [pack, setPack] = useState<StylePack>(openingPack);
    const [selFace, setSelFace] = useState(0);
    const [dial, setDial] = useState<Faces>(() => defaultDial(openingPack()));
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

    // ── history: undo / redo of CONTENT edits (parts / variants / meta / pack) ─
    // The dial's own navigation (select face, toggle 通/挡, switch preview variant)
    // is NOT recorded — it's preview state, not exported content; recording it would
    // bury the real edits. Snapshots are small (a StylePack is tiny JSON).
    const [past, setPast] = useState<Snapshot[]>([]);
    const [future, setFuture] = useState<Snapshot[]>([]);
    const pushUndo = () => { setPast((p) => [...p, { pack, dial, packs }].slice(-100)); setFuture([]); };
    const restore = (s: Snapshot) => {
        setPack(s.pack); setDial(s.dial); setPacks(s.packs); setCid(null);
        loaderRef.current?.apply(s.pack); loaderRef.current?.setFaces(s.dial);
    };
    const undo = () => { if (!past.length) return; const s = past[past.length - 1]; setPast((p) => p.slice(0, -1)); setFuture((f) => [...f, { pack, dial, packs }]); restore(s); };
    const redo = () => { if (!future.length) return; const s = future[future.length - 1]; setFuture((f) => f.slice(0, -1)); setPast((p) => [...p, { pack, dial, packs }]); restore(s); };
    const undoRef = useRef(undo); undoRef.current = undo;
    const redoRef = useRef(redo); redoRef.current = redo;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
            else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoRef.current(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── low-level appliers (no history) ───────────────────────────────────────
    const applyPack = (next: StylePack) => { setPack(next); setCid(null); loaderRef.current?.apply(next); };
    const applyDial = (d: Faces) => { setDial(d); loaderRef.current?.setFaces(d); };
    const dialWith = (fi: number, state: number, ref: string): Faces => dial.map((f, i) => (i === fi ? [state, ref] as [number, string] : f));

    // ── content edits (record ONE undo step) ──────────────────────────────────
    const editPack = (fn: (p: StylePack) => void) => { pushUndo(); const n: StylePack = JSON.parse(JSON.stringify(pack)); fn(n); applyPack(n); };

    // ── dial navigation / preview (NOT recorded) ──────────────────────────────
    const selectFace = (fi: number) => setSelFace(fi);
    /** Set a face's state + pick that state's first option; also selects the face. */
    const setFaceState = (fi: number, state: number) => { setSelFace(fi); applyDial(dialWith(fi, state, variantRef((state === 0 ? pack.open : pack.closed)[0], 0))); };
    /** Point the SELECTED face at variant `i` of its current pool (which one to edit). */
    const setVariant = (i: number) => applyDial(dialWith(selFace, selState, variantRef(pool[i], i)));
    /** Any dial interaction on a face selects it + applies. */
    const dialFace = (fi: number, state: number, ref: string) => { setSelFace(fi); applyDial(dialWith(fi, state, ref)); };

    /** Switch the previewed/edited pack. Recorded (so an accidental switch that
     *  drops your edits is one Ctrl+Z away). `record=false` when called by newPack. */
    const selectPack = (p: StylePack, record = true) => {
        if (record) pushUndo();
        const lp = liftPack(p);
        setPack(lp); setSelFace(0); setCid(null);
        const d = defaultDial(lp);
        setDial(d); loaderRef.current?.apply(lp); loaderRef.current?.setFaces(d);
    };

    /** Create a fresh blank pack (a plain solid box) → add it to the library and
     *  start editing it. Existing packs stay untouched references. */
    const newPack = () => {
        pushUndo();
        const ids = new Set(packs.map((p) => p.id));
        let n = 1; while (ids.has(`new-${n}`)) n++;
        const blank: StylePack = {
            format: 'septopus.spp.stylepack', version: 1, id: `new-${n}`, thickness: 0.2, color: 0x9aa0a6,
            closed: [{ key: 'solid', name: 'solid', parts: [{ type: 0x00a1, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] }] }],
            open: [{ key: 'empty', name: 'empty', parts: [] }],
        };
        setPacks((ps) => [...ps, blank]);
        selectPack(blank, false);
    };

    // ── option (variant) editing — targets the selected face's variant ────────
    const addPart = (def: VariantPart) => editPack((n) => { n[tab][vi].parts!.push(JSON.parse(JSON.stringify(def))); });
    const removePart = (pi: number) => editPack((n) => { n[tab][vi].parts!.splice(pi, 1); });
    const setPartField = (pi: number, key: keyof VariantPart, val: any) => editPack((n) => { (n[tab][vi].parts![pi] as any)[key] = val; });
    const addVariant = () => {
        pushUndo();
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        const k = `v${n[tab].length}`; n[tab].push({ key: k, name: k, parts: [] });
        applyPack(n);
        applyDial(dialWith(selFace, selState, k)); // point the selected face at (and edit) the new variant
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
            <FaceStateEditor pack={pack} packs={packs} selFace={selFace} selState={selState} pool={pool} vi={vi} variant={variant} cid={cid}
                canUndo={past.length > 0} canRedo={future.length > 0} onUndo={undo} onRedo={redo}
                onEditPack={editPack} onSelectPack={selectPack} onNewPack={newPack} onSetFaceState={(state) => setFaceState(selFace, state)}
                onSetVariant={setVariant} onAddVariant={addVariant} onAddPart={addPart} onRemovePart={removePart}
                onSetPartField={setPartField} onExport={exportPack} onPublish={publish} />
        </div>
    );
}
