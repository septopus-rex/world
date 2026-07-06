import * as THREE from 'three';
import { Engine } from '@engine/Engine';
import type { IDataSource } from '@engine/core/services/DataSource';
import type { StylePack } from '@engine/core/spp/Variants';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
import { Coords } from '@engine/core/utils/Coords';

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

    // ── IDataSource ──────────────────────────────────────────────────────────
    async world(_i: number): Promise<any> { return JSON.parse(JSON.stringify(MockWorldNormal)); }
    async module(_ids: number[]): Promise<any> { return {}; }
    async texture(_ids: number[]): Promise<any> { return {}; }
    async view(): Promise<any> { return null; }
    async stylePack(refs: string[]): Promise<Record<string, StylePack>> {
        const out: Record<string, StylePack> = {};
        if (this.pack) for (const r of refs) if (r === this.pack.id) out[r] = this.pack;
        return out;
    }

    private buildBlockRaw(): any[] {
        const themeId = this.pack?.id ?? 'basic';
        const cell = { position: [0, 0, 0], level: 0, faces: this.faces.map(f => [...f]) };
        // A tiny box far below suppresses BlockSystem's auto-ground (hasGround = a
        // Box with oz<0). Out of frame, so the 粒子 floats in the sky with no ground
        // under it — the Bottom face is inspectable and nothing looks odd.
        const groundSuppressor = [[0.01, 0.01, 0.01], [8, 8, -1000], [0, 0, 0], 0, [1, 1], 0, 0];
        return [0, 1, [
            [AdjunctType.Box, [groundSuppressor]],
            [AdjunctType.Spp, [[CELL_ORIGIN, [cell], themeId]]],
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
        // Face centres + normals in engine space (for labels + highlight).
        this.faceCentersEng = FACE_CENTERS_SEP.map(c => new THREE.Vector3(...Coords.septopusToEngine(c, PREVIEW_BLOCK)));
        this.faceNormalsEng = FACE_CENTERS_SEP.map((c, i) => {
            const a = Coords.septopusToEngine(c, PREVIEW_BLOCK);
            const nS = FACE_NORMALS_SEP[i];
            const b = Coords.septopusToEngine([c[0] + nS[0], c[1] + nS[1], c[2] + nS[2]], PREVIEW_BLOCK);
            return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        });
        this.faceCornersEng = FACE_CORNER_OFF.map(corners => corners.map(off =>
            new THREE.Vector3(...Coords.septopusToEngine([O[0] + off[0] * S, O[1] + off[1] * S, O[2] + off[2] * S], PREVIEW_BLOCK))));
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
        const R = 4;                          // bounding sphere of a 4m cell (+ part margin)
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

    /** Apply an (edited) pack — re-register + re-inject so the preview updates. */
    apply(pack: StylePack): void {
        this.pack = pack;
        if (!this.engine) return;
        this.engine.registerStylePack(pack); // same id → overwrites the registry entry
        this.injectPreview();
    }

    /** Set the six faces (the collapse dial) and re-inject. */
    setFaces(faces: Faces): void {
        this.faces = faces.map(f => [...f]) as Faces;
        this.injectPreview();
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

    getEngine(): Engine | null { return this.engine; }
    dispose(): void { this.ro?.disconnect(); this.engine?.stop(); }
}
