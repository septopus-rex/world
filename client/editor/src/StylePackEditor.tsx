import { useEffect, useRef, useState } from 'react';
import type { StylePack, VariantPart } from '@engine/core/spp/Variants';
import { checkPack } from '@engine/core/spp/OptionGuard';
import { allStylePacks } from '@core/stylepacks';
import type { Faces } from './StylePackPreviewLoader';
import { usePreviewLoader } from './usePreviewLoader';
import { PreviewPane } from './PreviewPane';
import { FaceStateEditor } from './FaceStateEditor';
import { type Pool, liftPack, variantRef, defaultDial, blankPrefab } from './constants';

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

/** An undo/redo snapshot of the editable document (pack + preview dial + library
 *  + which 组合件 was open). */
type Snapshot = { pack: StylePack; dial: Faces; packs: StylePack[]; selPrefab: string | null };

export default function StylePackEditor() {
    const [packs, setPacks] = useState<StylePack[]>(() => allStylePacks());
    const [pack, setPack] = useState<StylePack>(openingPack);
    const [selFace, setSelFace] = useState(0);
    const [dial, setDial] = useState<Faces>(() => defaultDial(openingPack()));
    const [cid, setCid] = useState<string | null>(null);
    /**
     * Which 组合件 is being edited, by key — null = face mode (§9). The editor has
     * exactly one preview, so this is a MODE, not a second selection: everything
     * downstream (which parts the panel edits, what the 3D view shows) derives
     * from it, and no state can disagree with the picture.
     */
    const [selPrefab, setSelPrefab] = useState<string | null>(null);

    const { loaderRef, labels, faces } = usePreviewLoader(pack, dial);
    // Highlight the selected face on the in-scene panels (recolour, zero lag).
    useEffect(() => { loaderRef.current?.setHighlightFace?.(selFace); }, [loaderRef, selFace]);
    // Debug handle, sibling of `window.spLoader`: the contract guard's verdict on
    // the CURRENT document. tools/snapshot.mjs reads it so the machine-checkable
    // half of a review comes from the same code the panel shows.
    useEffect(() => { (window as any).__spGuard = () => checkPack(pack); }, [pack]);

    // ── derived: the selected face's [state, variant] IS what we edit ─────────
    const [selState, selRef] = dial[selFace] ?? [1, variantRef(pack.closed[0], 0)];
    const tab: Pool = selState === 0 ? 'open' : 'closed';
    const pool = pack[tab] ?? [];
    const viFound = pool.findIndex((v, i) => variantRef(v, i) === String(selRef));
    const vi = viFound >= 0 ? viFound : 0;
    const variant = pool[vi];

    // ── derived: the prefab being edited (prefab mode only) ───────────────────
    const pfi = selPrefab === null ? -1 : (pack.prefabs ?? []).findIndex((p) => p.key === selPrefab);
    const prefab = pfi >= 0 ? pack.prefabs![pfi] : undefined;

    // ── history: undo / redo of CONTENT edits (parts / variants / meta / pack) ─
    // The dial's own navigation (select face, toggle 通/挡, switch preview variant)
    // is NOT recorded — it's preview state, not exported content; recording it would
    // bury the real edits. Snapshots are small (a StylePack is tiny JSON).
    // `selPrefab` IS recorded, because it is not navigation: undoing "delete the
    // bench" has to put you back in front of the bench, not in face mode looking
    // at an unrelated wall.
    const [past, setPast] = useState<Snapshot[]>([]);
    const [future, setFuture] = useState<Snapshot[]>([]);
    const snap = (): Snapshot => ({ pack, dial, packs, selPrefab });
    const pushUndo = () => { setPast((p) => [...p, snap()].slice(-100)); setFuture([]); };
    const restore = (s: Snapshot) => {
        setPack(s.pack); setDial(s.dial); setPacks(s.packs); setSelPrefab(s.selPrefab); setCid(null);
        loaderRef.current?.setFaces(s.dial);
        showInPreview(s.pack, s.selPrefab);
    };
    const undo = () => { if (!past.length) return; const s = past[past.length - 1]; const cur = snap(); setPast((p) => p.slice(0, -1)); setFuture((f) => [...f, cur]); restore(s); };
    const redo = () => { if (!future.length) return; const s = future[future.length - 1]; const cur = snap(); setFuture((f) => f.slice(0, -1)); setPast((p) => [...p, cur]); restore(s); };
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
    /** Point the 3D view at what the panel is editing — the pack, and within it
     *  either a 组合件 or the six-face cell. Everything that changes either half
     *  goes through here, so the picture can never lag the document. */
    const showInPreview = (p: StylePack, prefabKey: string | null) => {
        loaderRef.current?.show(p, prefabKey === null ? null : (p.prefabs ?? []).find((x) => x.key === prefabKey) ?? null);
    };
    const applyPack = (next: StylePack) => { setPack(next); setCid(null); showInPreview(next, selPrefab); };
    const applyDial = (d: Faces) => { setDial(d); loaderRef.current?.setFaces(d); };
    const dialWith = (fi: number, state: number, ref: string): Faces => dial.map((f, i) => (i === fi ? [state, ref] as [number, string] : f));

    // ── content edits (record ONE undo step) ──────────────────────────────────
    const editPack = (fn: (p: StylePack) => void) => { pushUndo(); const n: StylePack = JSON.parse(JSON.stringify(pack)); fn(n); applyPack(n); };

    // ── dial navigation / preview (NOT recorded) ──────────────────────────────
    /** Any face interaction leaves prefab mode: the preview shows ONE subject, so
     *  clicking a face while a bench is on screen has to mean "show me the face". */
    const backToFaces = () => { if (selPrefab !== null) { setSelPrefab(null); showInPreview(pack, null); } };
    const selectFace = (fi: number) => { backToFaces(); setSelFace(fi); };
    /** Set a face's state + pick that state's first option; also selects the face.
     *  Defensive on an empty pool: packs can arrive from import/CID, and a face
     *  that cannot resolve an option should stay put rather than crash the tool. */
    const setFaceState = (fi: number, state: number) => {
        const target = (state === 0 ? pack.open : pack.closed) ?? [];
        if (!target.length) return;
        backToFaces();
        setSelFace(fi);
        applyDial(dialWith(fi, state, variantRef(target[0], 0)));
    };
    /** Point the SELECTED face at variant `i` of its current pool (which one to edit). */
    const setVariant = (i: number) => { backToFaces(); applyDial(dialWith(selFace, selState, variantRef(pool[i], i))); };
    /** Any dial interaction on a face selects it + applies. */
    const dialFace = (fi: number, state: number, ref: string) => { backToFaces(); setSelFace(fi); applyDial(dialWith(fi, state, ref)); };

    /** Switch the previewed/edited pack. Recorded (so an accidental switch that
     *  drops your edits is one Ctrl+Z away). `record=false` when called by newPack. */
    const selectPack = (p: StylePack, record = true) => {
        if (record) pushUndo();
        const lp = liftPack(p);
        setPack(lp); setSelFace(0); setSelPrefab(null); setCid(null);
        const d = defaultDial(lp);
        setDial(d); loaderRef.current?.setFaces(d); showInPreview(lp, null);
    };

    /** Create a fresh blank pack (a plain solid box) → add it to the library and
     *  start editing it. Existing packs stay untouched references. */
    const newPack = () => {
        pushUndo();
        const ids = new Set(packs.map((p) => p.id));
        let n = 1; while (ids.has(`new-${n}`)) n++;
        // No pack-level `color`: it is only threaded into legacy `pieces`
        // (Expander.ts variantParts), and this editor only ever authors `parts`.
        // A blank used to carry 0x9aa0a6, which every export then advertised and
        // nothing ever honoured — the preview showed a1's own #f8f8f8 instead.
        // Colour belongs on the part, in raw slot 3, where the picker writes it.
        const blank: StylePack = {
            format: 'septopus.spp.stylepack', version: 1, id: `new-${n}`, thickness: 0.2,
            closed: [{ key: 'solid', name: 'solid', parts: [{ type: 0x00a1, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] }] }],
            open: [{ key: 'empty', name: 'empty', parts: [] }],
        };
        setPacks((ps) => [...ps, blank]);
        selectPack(blank, false);
    };

    // ── parts editing — ONE set of handlers for both frames ───────────────────
    // Which list they hit is the editor's MODE, resolved here and nowhere else:
    // the panel component is the same in both cases (PartsEditor), so it must not
    // know whether it is looking at a face option or a 组合件.
    const partsOf = (n: StylePack): VariantPart[] => {
        if (selPrefab !== null) {
            const pf = (n.prefabs ?? []).find((p) => p.key === selPrefab);
            if (pf) { pf.parts ??= []; return pf.parts; }
        }
        n[tab][vi].parts ??= [];
        return n[tab][vi].parts!;
    };
    const addPart = (def: VariantPart) => editPack((n) => { partsOf(n).push(JSON.parse(JSON.stringify(def))); });
    const removePart = (pi: number) => editPack((n) => { partsOf(n).splice(pi, 1); });
    const setPartField = (pi: number, key: keyof VariantPart, val: any) => editPack((n) => { (partsOf(n)[pi] as any)[key] = val; });
    const setPart = (pi: number, part: VariantPart) => editPack((n) => { partsOf(n)[pi] = JSON.parse(JSON.stringify(part)); });

    // ── 组合件 CRUD (§9) ──────────────────────────────────────────────────────
    /** Enter/leave prefab mode. The preview follows immediately — mode and picture
     *  are set together so they cannot disagree. */
    const selectPrefab = (key: string | null) => { setSelPrefab(key); showInPreview(pack, key); };
    const addPrefab = () => {
        pushUndo();
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        n.prefabs ??= [];
        const taken = new Set(n.prefabs.map((p) => p.key));
        let i = 1; while (taken.has(`part-${i}`)) i++;
        const pf = blankPrefab(`part-${i}`);
        n.prefabs.push(pf);
        setPack(n); setCid(null); setSelPrefab(pf.key); showInPreview(n, pf.key);
    };
    const removePrefab = (key: string) => {
        pushUndo();
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        n.prefabs = (n.prefabs ?? []).filter((p) => p.key !== key);
        const next = selPrefab === key ? null : selPrefab;
        setPack(n); setCid(null); setSelPrefab(next); showInPreview(n, next);
    };
    /**
     * Rename a 组合件. The key IS the reference (`pack#key`), so renaming one that
     * blocks already reference detaches them — same trade-off as renaming an
     * option, and the same answer: allowed, because a library you cannot name
     * properly is worse, and CID freezing is what protects existing worlds (§3.6).
     * The editor's own selection moves with the rename so you keep editing the
     * thing you were editing.
     */
    const renamePrefab = (key: string, next: string) => {
        pushUndo();
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        const pf = (n.prefabs ?? []).find((p) => p.key === key);
        if (!pf) return;
        pf.key = next; pf.name = next;
        setPack(n); setCid(null); setSelPrefab(next); showInPreview(n, next);
    };
    const setPrefabSize = (key: string, meters: number) => editPack((n) => {
        const pf = (n.prefabs ?? []).find((p) => p.key === key);
        if (pf) pf.size = meters;
    });
    /**
     * Rename an option. The key IS the reference (P4), so every dial entry
     * pointing at the old one has to move with it — otherwise renaming silently
     * detaches every face that used it and they render empty, which reads as
     * "the editor ate my wall". Same invariant `removeVariant` maintains.
     */
    const renameVariant = (i: number, key: string) => {
        const from = variantRef(pool[i], i);
        editPack((n) => { n[tab][i].key = key; n[tab][i].name = key; });
        applyDial(dial.map(([s, r]) =>
            (s === selState && String(r) === from ? [s, key] : [s, r]) as [number, string]));
    };
    const addVariant = () => {
        pushUndo();
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        const k = `v${n[tab].length}`; n[tab].push({ key: k, name: k, parts: [] });
        applyPack(n);
        applyDial(dialWith(selFace, selState, k)); // point the selected face at (and edit) the new variant
    };
    /**
     * Delete an option from the current pool. Two invariants make this safe:
     *   · the pool never empties — a state with no option is a face that cannot
     *     collapse to anything, i.e. dead data (the button is disabled at 1);
     *   · no dangling reference — any face whose dial entry pointed at the
     *     deleted option is re-pointed at the pool's first one. Without this the
     *     face keeps a key that resolves to nothing and silently renders empty,
     *     which reads as "the editor lost my wall" rather than as a broken ref.
     */
    const removeVariant = (i: number) => {
        if (pool.length <= 1) return;
        pushUndo();
        const gone = variantRef(pool[i], i);
        const n: StylePack = JSON.parse(JSON.stringify(pack));
        n[tab].splice(i, 1);
        applyPack(n);
        const fallback = variantRef(n[tab][0], 0);
        applyDial(dial.map(([s, r]) =>
            (s === selState && String(r) === gone ? [s, fallback] : [s, r]) as [number, string]));
    };

    /**
     * Import a StylePack JSON (paste / tool / AI output) — the counterpart of
     * export, §3.8. It goes through the SAME React state as every other edit
     * (setPack + setDial via selectPack), NOT through `spLoader.apply`: applying
     * straight to the preview engine would update the 3D view while the panel,
     * the export and the undo history all kept the old document — the change
     * would look applied and silently not be.
     * Returns an error string for the UI, or null on success.
     */
    const importPack = (text: string): string | null => {
        let parsed: any;
        try { parsed = JSON.parse(text); } catch (e) { return `JSON 解析失败：${(e as Error).message}`; }
        if (!parsed || typeof parsed !== 'object') return '不是一个对象';
        if (typeof parsed.id !== 'string' || !parsed.id) return '缺少 id';
        if (!Array.isArray(parsed.closed) || !Array.isArray(parsed.open)) return '缺少 closed[] / open[] 两池';
        // BOTH pools must be non-empty: a face set to that state resolves the
        // pool's first option, and an empty pool makes that a crash rather than
        // a bad picture. (`open` is normally just `[{key:'empty',parts:[]}]`.)
        if (!parsed.closed.length) return 'closed 池不能为空（面设成「挡」时没有造型可坍缩）';
        if (!parsed.open.length) return 'open 池不能为空（面设成「通」时没有造型可坍缩，通常是一个空的 empty）';
        if (typeof parsed.thickness !== 'number') parsed.thickness = 0.2;
        // Prefabs are optional, but a malformed one must not slip in: `pack#key`
        // is the only way to reference a 组合件, so a keyless or duplicated entry
        // is a dangling reference the moment someone places it.
        if (parsed.prefabs != null) {
            if (!Array.isArray(parsed.prefabs)) return 'prefabs 必须是数组';
            const seen = new Set<string>();
            for (const [i, pf] of parsed.prefabs.entries()) {
                if (!pf || typeof pf.key !== 'string' || !pf.key) return `prefabs[${i}] 缺少 key（组合件只能按 pack#key 引用）`;
                if (seen.has(pf.key)) return `prefabs 里有重复的 key '${pf.key}'`;
                seen.add(pf.key);
                if (!Array.isArray(pf.parts)) pf.parts = [];
            }
        }
        pushUndo();
        const lp = liftPack(parsed as StylePack);
        // Same id ⇒ replace the library entry (importing a revision of a pack you
        // already have should not leave two entries with one name).
        setPacks((ps) => [...ps.filter((p) => p.id !== lp.id), lp]);
        selectPack(lp, false);
        return null;
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
                prefabKey={prefab ? prefab.key : null}
                onSelectFace={selectFace} onSetDialFace={dialFace} />
            <FaceStateEditor pack={pack} packs={packs} selFace={selFace} selState={selState} pool={pool} vi={vi} variant={variant}
                selPrefab={selPrefab} prefab={prefab} cid={cid}
                canUndo={past.length > 0} canRedo={future.length > 0} onUndo={undo} onRedo={redo}
                onEditPack={editPack} onSelectPack={selectPack} onNewPack={newPack} onSetFaceState={(state) => setFaceState(selFace, state)}
                onSetVariant={setVariant} onAddVariant={addVariant} onRemoveVariant={removeVariant} onRenameVariant={renameVariant}
                onSelectPrefab={selectPrefab} onAddPrefab={addPrefab} onRemovePrefab={removePrefab} onRenamePrefab={renamePrefab} onSetPrefabSize={setPrefabSize}
                onAddPart={addPart} onRemovePart={removePart} onSetPartField={setPartField} onSetPart={setPart}
                onExport={exportPack} onImport={importPack} onPublish={publish} />
        </div>
    );
}
