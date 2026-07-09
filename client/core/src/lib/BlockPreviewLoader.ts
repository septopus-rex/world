import { Engine } from '@engine/Engine';
import type { IDataSource } from '@engine/core/services/DataSource';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
import { registerItemTemplate, type ItemTemplate } from '@engine/core/services/ItemRegistry';
import { resolveStylePacks, allStylePackIds } from '../stylepacks';
import demoItemsJson from '../items/demo.items.json';

/**
 * BlockPreviewLoader — an INDEPENDENT renderer for observing block(s) in
 * isolation: its own Engine + canvas + scene, an Observe (orbit) camera, no
 * player interaction. Built for previews — inspect a block from the outside
 * now, and later frame a whole multi-block game before entering it. The engine
 * is game-agnostic, so this reuses the exact same block pipeline the live world
 * uses (inject raw → BlockSystem expands adjuncts), just pointed at a throwaway
 * world with a frozen orbit camera.
 *
 * v1 shows ONE block (the `blocks` array + injection loop already generalize to
 * many — multi-block game previews slot in without a rewrite). Content
 * resolution: stylepacks + demo items are registered so b6 spp / b5 item blocks
 * preview faithfully; external assets (module/texture) fall back to placeholders
 * (a follow-up can point them at the content gateway).
 */
export class BlockPreviewLoader implements IDataSource {
    private engine: Engine | null = null;
    private containerId = '';
    private blocks: Array<{ x: number; y: number; raw: any }> = [];
    private injected = false;
    private ro: ResizeObserver | null = null;
    private static itemsRegistered = false;
    private _framed = false;

    // ── IDataSource (minimal — the preview world serves only its own blocks) ──
    async world(_i: number): Promise<any> {
        const cfg = JSON.parse(JSON.stringify(MockWorldNormal));
        cfg.debug = { ...(cfg.debug ?? {}), stats: false };   // no FPS overlay in a preview
        return cfg;
    }
    // A 1×1 white pixel so requested textures load without error (the preview has
    // no asset pipeline; material tints still show). resolveUrl passes data: URIs.
    private static readonly WHITE_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    async module(_ids: number[]): Promise<any> { return {}; }   // a4 models → placeholder box
    async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) out[id] = { type: 'texture', format: 'png', raw: BlockPreviewLoader.WHITE_1PX, repeat: [1, 1] };
        return out;
    }
    async view(): Promise<any> { return null; }
    async stylePack(refs: string[]): Promise<Record<string, any>> { return resolveStylePacks(refs); }

    private inject(): void {
        if (!this.engine) return;
        for (const b of this.blocks) {
            this.engine.injectBlock({ x: b.x, y: b.y, world: 'main', elevation: b.raw?.[0] ?? 0, adjuncts: b.raw } as any);
        }
        this.injected = true;
    }

    /** Boot the preview around a single block (extensible to `setBlocks`). */
    async init(containerId: string, block: { x: number; y: number; raw: any }): Promise<void> {
        if (this.engine) return;
        this.containerId = containerId;
        this.blocks = [block];

        if (!BlockPreviewLoader.itemsRegistered) {
            for (const t of demoItemsJson as unknown as ItemTemplate[]) registerItemTemplate(t);
            BlockPreviewLoader.itemsRegistered = true;
        }

        this.engine = new Engine(containerId, { api: this } as any);
        this.engine.on('block.need' as any, () => { if (!this.injected) this.inject(); });
        // Boot inside the target block; extend 0 = only this block's neighbourhood.
        await this.engine.bootWorld(0, { block: [block.x, block.y], position: [8, 8, 2], rotation: [0, 0, 0], extend: 0 } as any);
        for (const pack of Object.values(resolveStylePacks(allStylePackIds()))) this.engine.registerStylePack(pack);
        this.inject();

        // Freeze the player + hide the avatar; orbit the block from outside.
        const w = this.engine.getWorld() as any;
        const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')?.[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = false;
        this.engine.setMode('observe' as any);
        // Kill the sky distance fog — at orbit distance it washes the block to
        // sky colour (fog is a first-person horizon effect, meaningless here).
        const scene = w?.renderEngine?.sceneInstance;
        if (scene) scene.fog = null;

        this.fitView();
        for (let i = 0; i < 10; i++) this.engine.step(1 / 60);  // settle expansion + orbit
        this.engine.start();

        const el = document.getElementById(containerId);
        if (el && typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => this.fitView());
            this.ro.observe(el);
        }
    }

    /** Frame the whole 16 m block: sync the renderer aspect to the container, then
     *  set the orbit radius = fit-the-block-bounding-sphere-to-the-frustum. */
    private fitView(): void {
        const w = this.engine?.getWorld() as any;
        const re = w?.renderEngine;
        const cc = w?.systems?.findSystemByName('CharacterController') as any;
        if (!re || !cc) return;
        const el = document.getElementById(this.containerId);
        const width = el?.clientWidth ?? 0, height = el?.clientHeight ?? 0;
        if (width < 2 || height < 2) return;
        re.resize?.();                         // sync aspect to the container
        if (this._framed) return;              // frame ONCE — later resizes keep the user's orbit/zoom
        const cam = re.mainCameraInstance;
        const aspect = cam.aspect > 0.01 ? cam.aspect : width / height;
        const vFov = (cam.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const R = 13;                          // bounding sphere of a 16×16×~4 m block
        const dist = (R / Math.sin(Math.min(vFov, hFov) / 2)) * 1.1;
        cc.setObserveOrbit?.(0.8, 0.5, dist);
        this._framed = true;
    }

    /** Zoom the orbit by a factor (<1 = closer, >1 = farther), clamped. Wheel /
     *  pinch on the preview canvas drive this. */
    public zoom(factor: number): void {
        const cc = (this.engine?.getWorld() as any)?.systems?.findSystemByName?.('CharacterController');
        const o = cc?.getObserveState?.();
        if (o) cc.setObserveOrbit(o.azimuth, o.elevation, Math.max(2.5, Math.min(38, o.radius * factor)));
    }

    getEngine(): Engine | null { return this.engine; }

    dispose(): void {
        this.ro?.disconnect(); this.ro = null;
        this.engine?.stop();
        this.engine = null;
        this.injected = false;
    }
}
