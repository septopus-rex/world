import * as THREE from 'three';
import { Engine } from '@engine/Engine';
import type { IDataSource } from '@engine/core/services/DataSource';
import type { StylePack, Prefab } from '@engine/core/spp/Variants';
import { DEFAULT_PREFAB_SIZE } from '@engine/core/spp/Variants';
import { expandPrefab } from '@engine/core/spp/Expander';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
// Content side of the shared core (the resource manifest) — same asset ids the
// world apps resolve, so a pack's texture references mean the same thing here.
import { DEMO_ASSETS } from '@core/scenes/demoScene';


/**
 * StylePackPreviewLoader — a LEAN engine harness for the SPP粒子 editor's 3D
 * preview (spp-editors.md, path b). It boots a minimal Engine showing ONE b6
 * SPP cell — the "SPP 粒子" — whose six faces are driven by the editor's collapse
 * dial (`setFaces`), then orbits it in Observe mode. `apply()` re-registers the
 * (edited) pack and re-injects the cell so edits show live. Reuses the full
 * engine render pipeline (deserialize + Coords + MeshFactory + ResourceManager)
 * — no bespoke render code — while staying independent of the world app.
 */

const PREVIEW_BLOCK: [number, number] = [0, 0];
// 4m cell floating so its centre aligns with the observe target (player [8,8,2.2]
// + 1 up in engine space) → the 粒子 sits centred in view with NO ground under it.
const CELL_ORIGIN: [number, number, number] = [6, 6, 1.2];
const CELL_SIZE = 4;

/** Face order matches ParticleFace: Top, Bottom, Front, Back, Left, Right. */
export type Faces = Array<[number, number | string]>;

// Face centres + outward normals in Septopus, then converted to engine space in
// init(). Order = ParticleFace [Top, Bottom, Front(S), Back(N), Left(W), Right(E)].
const O = CELL_ORIGIN, S = CELL_SIZE;
const FACE_CENTERS_SEP: Array<[number, number, number]> = [
    [O[0] + S / 2, O[1] + S / 2, O[2] + S], // Top    Z+
    [O[0] + S / 2, O[1] + S / 2, O[2]],     // Bottom Z-
    [O[0] + S / 2, O[1], O[2] + S / 2],     // Front  Y-
    [O[0] + S / 2, O[1] + S, O[2] + S / 2], // Back   Y+
    [O[0], O[1] + S / 2, O[2] + S / 2],     // Left   X-
    [O[0] + S, O[1] + S / 2, O[2] + S / 2], // Right  X+
];
const FACE_NORMALS_SEP: Array<[number, number, number]> = [
    [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0],
];
// The 4 corners of each face, as 0/1 offsets per axis (× cell size + origin).
const FACE_CORNER_OFF: Array<Array<[number, number, number]>> = [
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // Top
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], // Bottom
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // Front
    [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], // Back
    [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], // Left
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // Right
];

export interface FaceLabel { x: number; y: number; front: boolean; }

export class StylePackPreviewLoader implements IDataSource {
    private engine: Engine | null = null;
    private pack: StylePack | null = null;
    private faces: Faces = Array.from({ length: 6 }, () => [1, 0] as [number, number]);
    private injected = false;
    private containerId = 'sp-preview';
    private ro: ResizeObserver | null = null;
    private faceCentersEng: THREE.Vector3[] = [];
    private faceNormalsEng: THREE.Vector3[] = [];
    private faceCornersEng: THREE.Vector3[][] = [];
    private panels: THREE.Mesh[] = [];   // 6 in-scene semi-transparent face panels
    private highlighted = 0;

    // ── IDataSource ──────────────────────────────────────────────────────────
    async world(_i: number): Promise<any> { return JSON.parse(JSON.stringify(MockWorldNormal)); }
    async view(): Promise<any> { return null; }

    /**
     * Resources (textures / models) — resolved from the SAME manifest the world
     * apps use, through the SAME CAS路径 (fetch → engine.ipfs.put → id→CID).
     *
     * These were `return {}` stubs, and the consequence was worse than "no
     * textures in the preview": it made the editor LIE. `terran`'s options all
     * reference texture 36 (a detailed armour-panel image that ships in
     * public/assets); with the stub the id resolved to nothing and every face
     * rendered flat grey — so the pack looked crude in the tool while rendering
     * correctly in the world. Anyone judging by the preview (a person, or a
     * model reading a screenshot) would "fix" a problem that was not in the
     * data. §3.5's promise is 编辑器所见 = world 所渲; a stub here breaks exactly
     * that.
     */
    private _resCache = new Map<number, any>();
    private async ingestAsset(id: number): Promise<any | null> {
        const cached = this._resCache.get(id);
        if (cached) return cached;
        const asset = DEMO_ASSETS.find((a) => a.id === id);
        const router = (this.engine as any)?.ipfs;
        if (!asset || !router) return null;
        let rec: any = null;
        try {
            const resp = await fetch(asset.src);
            if (!resp.ok) return null;   // a tool must not die over a missing asset
            const cid = await router.put(new Uint8Array(await resp.arrayBuffer()));
            rec = {
                type: asset.type, format: asset.format, raw: cid,
                ...(asset.repeat ? { repeat: asset.repeat } : {}),
                ...(asset.size ? { size: asset.size } : {}),
            };
        } catch { return null; }
        this._resCache.set(id, rec);
        return rec;
    }
    async module(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) { const r = await this.ingestAsset(id); if (r && r.type !== 'texture') out[id] = r; }
        return out;
    }
    async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) { const r = await this.ingestAsset(id); if (r && r.type === 'texture') out[id] = r; }
        return out;
    }
    async stylePack(refs: string[]): Promise<Record<string, StylePack>> {
        const out: Record<string, StylePack> = {};
        if (this.pack) for (const r of refs) if (r === this.pack.id) out[r] = this.pack;
        return out;
    }

    /**
     * Optional MULTI-CELL preview: a whole little structure instead of the one
     * unit cell. The editor edits ONE cell — that stays its job — but "what does
     * my library actually build?" is a question about the library, and answering
     * it by hand-authoring a level every time is why option sets go unverified.
     * Null (default) = the single editing cell. Set via `setCells`.
     */
    private cells: any[] | null = null;
    setCells(cells: any[] | null): void {
        this.cells = cells;
        this.syncPanels();
        this.injectPreview();
    }

    /**
     * PREFAB mode (§9): preview one 组合件 instead of the six-face cell. Null
     * returns to the cell.
     *
     * It is rendered by stamping `expandPrefab` — the SAME call the world palette
     * makes — straight into the block raw, NOT through a b6 source. That is the
     * point rather than a shortcut: a prefab has no faces to collapse, and going
     * through the identical code path is what makes 编辑器所见 = world 所渲 true
     * for furniture (§3.5). If this ever grew its own row builder, the tool would
     * be able to show a bench the world cannot place.
     */
    private prefab: Prefab | null = null;
    setPrefab(prefab: Prefab | null): void {
        if (this.pack) { this.show(this.pack, prefab); return; }
        this.prefab = prefab;
        this.syncPanels();
    }

    /** The six translucent face panels are an aid for picking ONE cell's face; in
     *  a multi-cell structure or a prefab they just fog what you came to look at. */
    private syncPanels(): void {
        const show = !this.cells && !this.prefab;
        for (const p of this.panels) p.visible = show;
    }

    /** Edge (meters) of whatever the preview is currently framing. */
    private unitSize(): number {
        return this.prefab ? (this.prefab.size ?? DEFAULT_PREFAB_SIZE) : CELL_SIZE;
    }

    private buildBlockRaw(): any[] {
        const themeId = this.pack?.id ?? 'basic';
        // A tiny box far below suppresses BlockSystem's auto-ground (hasGround = a
        // Box with oz<0). Out of frame, so the 粒子 floats in the sky with no ground
        // under it — the Bottom face is inspectable and nothing looks odd.
        const groundSuppressor = [[0.01, 0.01, 0.01], [8, 8, -1000], [0, 0, 0], 0, [1, 1], 0, 0];
        const suppressor: any[] = [AdjunctType.Box, [groundSuppressor]];

        if (this.prefab) {
            // Centre the prefab's cube on the same point the cell occupies, so
            // switching modes does not move the subject out of frame.
            const s = this.unitSize();
            const c = [CELL_ORIGIN[0] + CELL_SIZE / 2, CELL_ORIGIN[1] + CELL_SIZE / 2, CELL_ORIGIN[2] + CELL_SIZE / 2];
            const origin: [number, number, number] = [c[0] - s / 2, c[1] - s / 2, c[2] - s / 2];
            // Rows arrive as [typeId, raw]; block raw wants them grouped per type.
            const byType = new Map<number, any[][]>();
            for (const [typeId, raw] of expandPrefab(this.prefab, origin, s)) {
                if (!byType.has(typeId)) byType.set(typeId, []);
                byType.get(typeId)!.push(raw);
            }
            return [0, 1, [suppressor, ...[...byType].map(([t, rows]) => [t, rows])], []];
        }

        const cell = this.cells
            ? null
            : { position: [0, 0, 0], level: 0, faces: this.faces.map(f => [...f]) };
        return [0, 1, [
            suppressor,
            [AdjunctType.Spp, [[CELL_ORIGIN, this.cells ?? [cell], themeId]]],
        ], []];
    }

    private injectPreview(): void {
        if (!this.engine) return;
        if (this.injected) this.engine.removeBlock(PREVIEW_BLOCK[0], PREVIEW_BLOCK[1]);
        this.engine.injectBlock({ x: PREVIEW_BLOCK[0], y: PREVIEW_BLOCK[1], adjuncts: this.buildBlockRaw(), elevation: 0 } as any);
        this.injected = true;
    }

    async init(containerId: string, initial: StylePack, faces?: Faces): Promise<void> {
        if (this.engine) return;
        this.containerId = containerId;
        this.pack = initial;
        if (faces) this.faces = faces;
        this.engine = new Engine(containerId, { api: this } as any);
        this.engine.on('block.need' as any, () => { if (!this.injected) this.injectPreview(); });
        await this.engine.bootWorld(0, { block: PREVIEW_BLOCK, position: [8, 8, 2.2], rotation: [0, 0, 0], extend: 0 } as any);
        if (this.pack) this.engine.registerStylePack(this.pack);
        this.injectPreview();
        // Hide the avatar + orbit the cell from outside.
        const w = this.engine.getWorld() as any;
        const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')?.[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = false;
        this.engine.setMode('observe' as any);
        // Face centres + normals in engine space (for labels + highlight). Block
        // offsets come from the preview world's own geometry, not a global.
        const m = this.engine.getWorld()!.metrics;
        this.faceCentersEng = FACE_CENTERS_SEP.map(c => new THREE.Vector3(...m.septopusToEngine(c, PREVIEW_BLOCK)));
        this.faceNormalsEng = FACE_CENTERS_SEP.map((c, i) => {
            const a = m.septopusToEngine(c, PREVIEW_BLOCK);
            const nS = FACE_NORMALS_SEP[i];
            const b = m.septopusToEngine([c[0] + nS[0], c[1] + nS[1], c[2] + nS[2]], PREVIEW_BLOCK);
            return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        });
        this.faceCornersEng = FACE_CORNER_OFF.map(corners => corners.map(off =>
            new THREE.Vector3(...m.septopusToEngine([O[0] + off[0] * S, O[1] + off[1] * S, O[2] + off[2] * S], PREVIEW_BLOCK))));
        // Six semi-transparent face panels as REAL scene meshes (the engine renders
        // this.scene) → they track the box exactly during orbit, zero overlay lag.
        const scene = (this.engine.getWorld() as any)?.renderEngine?.sceneInstance;
        if (scene) {
            for (let i = 0; i < 6; i++) {
                const m = new THREE.Mesh(
                    new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE),
                    new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
                );
                m.position.copy(this.faceCentersEng[i]).addScaledVector(this.faceNormalsEng[i], 0.04);
                m.lookAt(this.faceCentersEng[i].clone().add(this.faceNormalsEng[i]));
                m.renderOrder = 998;
                scene.add(m);
                this.panels.push(m);
            }
            this.setHighlightFace(0);
        }
        this.fitView(); // correct the aspect (the div is sized now) + auto-frame the cell
        for (let i = 0; i < 8; i++) this.engine.step(1 / 60); // settle the orbit
        this.engine.start();
        // Re-fit on container resize (aspect changes → refit distance).
        const el = document.getElementById(this.containerId);
        if (el && typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => this.fitView());
            this.ro.observe(el);
        }
    }

    /**
     * Fit the observe orbit so the whole 粒子 frames on screen. Syncs the renderer
     * aspect to the container (the root cause of the "zoomed-in" preview was a
     * stale aspect), then sets the orbit radius = fit-sphere-to-frustum distance
     * for the cell's bounding sphere, honouring the camera's fov AND aspect.
     */
    private fitView(): void {
        const w = this.engine?.getWorld() as any;
        const re = w?.renderEngine;
        const cc = w?.systems?.findSystemByName('CharacterController') as any;
        if (!re || !cc) return;
        const el = document.getElementById(this.containerId);
        const width = el?.clientWidth ?? 0, height = el?.clientHeight ?? 0;
        if (width < 2 || height < 2) return; // not laid out yet — the ResizeObserver will refit
        re.resize?.();                       // aspect + setSize ← the container's real size
        const cam = re.mainCameraInstance;
        const aspect = cam.aspect > 0.01 ? cam.aspect : width / height;
        const vFov = (cam.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const R = this.unitSize();            // bounding sphere of the framed cube (+ part margin)
        const dist = (R / Math.sin(Math.min(vFov, hFov) / 2)) * 1.15;
        cc.setObserveOrbit?.(0.8, 0.5, dist);
    }

    /** Diagnostic: player / camera / a wall position + observe state. */
    debug(): any {
        const w = this.engine?.getWorld() as any;
        if (!w) return null;
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')?.[0];
        const player = pid != null ? w.getComponent(pid, 'TransformComponent')?.position : null;
        let wall: any = null;
        for (const eid of w.queryEntities('AdjunctComponent', 'TransformComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (a?.stdData?.derivedFrom) { wall = w.getComponent(eid, 'TransformComponent')?.position; break; }
        }
        const cc = w.systems?.findSystemByName('CharacterController') as any;
        const cam = (w.renderEngine as any)?.mainCameraInstance?.position;
        return { player, wall, cam: cam ? [cam.x, cam.y, cam.z] : null, obs: cc?.getObserveState?.() };
    }

    /**
     * Show an (edited) pack, and within it either a PREFAB or the six-face cell.
     * One entry point on purpose: pack and subject change together on almost
     * every edit (typing in a prefab's part changes both), and two calls would
     * re-inject the block twice and briefly render the new pack with the old
     * subject.
     */
    show(pack: StylePack, prefab: Prefab | null): void {
        this.pack = pack;
        this.prefab = prefab;
        this.syncPanels();
        if (!this.engine) return;
        this.engine.registerStylePack(pack); // same id → overwrites the registry entry
        this.injectPreview();
        this.fitView();                      // a prefab has its own size
    }

    /** Apply an (edited) pack, keeping the current subject. */
    apply(pack: StylePack): void {
        this.show(pack, this.prefab);
    }

    /** Set the six faces (the collapse dial) and re-inject. */
    setFaces(faces: Faces): void {
        this.faces = faces.map(f => [...f]) as Faces;
        this.injectPreview();
    }

    /**
     * Everything actually visible in the preview, whatever the mode — for
     * tests/verification. Cell mode produces DERIVED entities (b6 expansion),
     * prefab mode produces AUTHORED ones (a stamp), so a count that only knew
     * about `derivedFrom` would report 0 for every prefab. The ground
     * suppressor (parked at z=-1000, out of frame) is excluded.
     */
    previewCount(typeId?: number): number {
        const w = this.engine?.getWorld() as any;
        if (!w) return 0;
        let n = 0;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (!a?.stdData) continue;
            if (typeof a.adjunctId === 'string' && a.adjunctId.startsWith('ground')) continue;
            const t = w.getComponent(eid, 'TransformComponent');
            if (t && t.position?.[1] < -100) continue;   // the suppressor
            if (typeId != null && a.stdData.typeId !== typeId) continue;
            n++;
        }
        return n;
    }

    /** Derived entities of a type in the preview — for tests/verification. */
    derivedCount(typeId?: number): number {
        const w = this.engine?.getWorld() as any;
        if (!w) return 0;
        let n = 0;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (a?.stdData?.derivedFrom && (typeId == null || a.stdData.typeId === typeId)) n++;
        }
        return n;
    }

    /** Screen positions (px, in the preview canvas) of the six face centres, with
     *  a `front` flag (facing the camera + in front) — for HTML face labels. */
    faceLabels(): FaceLabel[] {
        const re = (this.engine?.getWorld() as any)?.renderEngine;
        const cam = re?.mainCameraInstance;
        const el = document.getElementById(this.containerId);
        if (!cam || !el || this.faceCentersEng.length !== 6) return [];
        const width = el.clientWidth, height = el.clientHeight;
        return this.faceCentersEng.map((c, i) => {
            const v = c.clone().project(cam);
            const toCam = new THREE.Vector3().subVectors(cam.position, c);
            return {
                x: (v.x * 0.5 + 0.5) * width,
                y: (-v.y * 0.5 + 0.5) * height,
                front: this.faceNormalsEng[i].dot(toCam) > 0 && v.z < 1,
            };
        });
    }

    /** The selected face's 4 corners projected to screen px (for an SVG highlight
     *  overlay), plus a `front` flag. Reliable HTML overlay — no dependency on the
     *  engine render pipeline drawing an ad-hoc scene mesh. */
    faceCorners(idx: number): { pts: Array<{ x: number; y: number }>; front: boolean } | null {
        const re = (this.engine?.getWorld() as any)?.renderEngine;
        const cam = re?.mainCameraInstance;
        const el = document.getElementById(this.containerId);
        if (!cam || !el || !this.faceCornersEng[idx]) return null;
        const width = el.clientWidth, height = el.clientHeight;
        const c = this.faceCentersEng[idx];
        const toCam = new THREE.Vector3().subVectors(cam.position, c);
        const front = this.faceNormalsEng[idx].dot(toCam) > 0;
        const pts = this.faceCornersEng[idx].map(v => {
            const p = v.clone().project(cam);
            return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height };
        });
        return { pts, front };
    }

    /** All six faces' corner polygons (screen px) — for click hit-testing. */
    allFaceCorners(): Array<{ pts: Array<{ x: number; y: number }>; front: boolean } | null> {
        return [0, 1, 2, 3, 4, 5].map(i => this.faceCorners(i));
    }

    /** Recolour the in-scene face panels: selected = bright cyan, others = faint. */
    setHighlightFace(idx: number): void {
        this.highlighted = idx;
        this.panels.forEach((m, i) => {
            const mat = m.material as THREE.MeshBasicMaterial;
            if (i === idx) { mat.color.setHex(0x22d3ee); mat.opacity = 0.42; }
            else { mat.color.setHex(0x93c5fd); mat.opacity = 0.14; }
        });
    }

    getEngine(): Engine | null { return this.engine; }
    dispose(): void {
        this.ro?.disconnect();
        this.panels.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
        this.engine?.stop();
    }
}
