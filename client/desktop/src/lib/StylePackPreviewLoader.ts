import { Engine } from '@engine/Engine';
import type { IDataSource } from '@engine/core/services/DataSource';
import type { StylePack } from '@engine/core/spp/Variants';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';

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
const CELL_ORIGIN: [number, number, number] = [6, 6, 0.2]; // 4m cell, sits ~on the ground

/** Face order matches ParticleFace: Top, Bottom, Front, Back, Left, Right. */
export type Faces = Array<[number, number | string]>;

export class StylePackPreviewLoader implements IDataSource {
    private engine: Engine | null = null;
    private pack: StylePack | null = null;
    private faces: Faces = Array.from({ length: 6 }, () => [1, 0] as [number, number]);
    private injected = false;

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
        return [0, 1, [[AdjunctType.Spp, [[CELL_ORIGIN, [cell], themeId]]]], []];
    }

    private injectPreview(): void {
        if (!this.engine) return;
        if (this.injected) this.engine.removeBlock(PREVIEW_BLOCK[0], PREVIEW_BLOCK[1]);
        this.engine.injectBlock({ x: PREVIEW_BLOCK[0], y: PREVIEW_BLOCK[1], adjuncts: this.buildBlockRaw(), elevation: 0 } as any);
        this.injected = true;
    }

    async init(containerId: string, initial: StylePack, faces?: Faces): Promise<void> {
        if (this.engine) return;
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
        const cc = w?.systems?.findSystemByName('CharacterController') as any;
        cc?.setObserveOrbit?.(0.8, 0.55, 13); // frame the 4m cell from outside-above, with margin
        for (let i = 0; i < 8; i++) this.engine.step(1 / 60); // settle the orbit
        this.engine.start();
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

    getEngine(): Engine | null { return this.engine; }
    dispose(): void { this.engine?.stop(); }
}
