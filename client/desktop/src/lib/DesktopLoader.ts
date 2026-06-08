/**
 * DesktopLoader — chain-free engine loader for the desktop 3D client.
 *
 * This is the pure-3D counterpart of app/src/SandboxLoader.ts: it boots the
 * Septopus ECS engine and feeds it block data, but has NO dependency on the
 * chain (no @solana/*, no SeptopusContract) and NO IPFS. Block data comes from
 * the engine's local mocks.
 *
 * Roadmap (see docs/plan/STANDALONE_ENGINE_ROADMAP.md):
 *   - `fetchBlock` is the single data seam. Today it returns local mocks;
 *     Phase 1 swaps in a LocalDataSource backed by DraftStorage so locally
 *     edited blocks persist and reload.
 *   - "Publish selected block on-chain" stays out of this client; it belongs
 *     to an optional chain plugin (IChainPublisher) that the editor build adds.
 */
import { Engine } from '@engine/Engine';
import { TransformComponent } from '@engine/core/components/PlayerComponents';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
import { fetchMockBlock } from '@engine/core/mocks/BlockMocks';
import { IDataSource } from '@engine/core/services/DataSource';

import { DEFAULT_PLAYER_STATE, STORAGE_KEYS } from '../Constants';

// Demo fixtures (client/desktop/public/assets) wired through the model/texture
// pipeline so `npm run dev` shows real network-loaded models + textures. Each
// model file is loaded ONCE and instanced per placement; textures are shared.
const DEMO_BLOCK: [number, number] = [2048, 2048];
const DEMO_TEXTURE_ID = 7;  // → /assets/checker.png

// Resource id → model record. Real Khronos sample assets (helmet = complex PBR
// with baked textures; fox = rigged + animated, exercises SkeletonUtils.clone).
const DEMO_AVATAR_ID = 30;  // → /assets/avatar.glb (rigged human)
const DEMO_MODELS: Record<number, { type: string; format: string; raw: string }> = {
    27: { type: 'module', format: 'gltf', raw: '/assets/pyramid.gltf' },
    28: { type: 'module', format: 'glb', raw: '/assets/helmet.glb' },
    29: { type: 'module', format: 'glb', raw: '/assets/fox.glb' },
    30: { type: 'avatar', format: 'glb', raw: '/assets/avatar.glb' },
};

export interface SPPPlayerState {
    block: [number, number];
    world: string | number;
    position: [number, number, number]; // [X, Y, Z] (X=East, Y=North, Z=Alt)
    rotation: [number, number, number]; // [X, Y, Z] (Euler Z-Up)
    stop: { on: boolean; adjunct: string; index: number };
    extend: number;
    posture: number;
}

export class DesktopLoader implements IDataSource {
    public engine: Engine | null = null;
    private readonly STORAGE_KEY = STORAGE_KEYS.PLAYER_STATE;

    private loadedBlockKeys: Set<string> = new Set();
    private fetchingBlockKeys: Set<string> = new Set();
    private blockLastSeen: Map<string, number> = new Map();
    /** Evict blocks that have been outside the view window longer than this (ms). */
    private static readonly EVICT_TTL_MS = 10_000;

    public playerState: SPPPlayerState = { ...DEFAULT_PLAYER_STATE };

    // ── IDataSource ───────────────────────────────────────────────────────────

    public async world(_index: number): Promise<any> {
        // Local Genesis world config + a demo avatar resource so the player has a
        // real (network-loaded) body instead of the placeholder box.
        const cfg = JSON.parse(JSON.stringify(MockWorldNormal));
        if (cfg.player?.avatar) cfg.player.avatar.resource = DEMO_AVATAR_ID;
        return cfg;
    }

    public async view(_x: number, _y: number, _ext: number, _worldIndex: number): Promise<any> {
        // Neighborhood fetching is driven by handleGridRequest below.
        return null;
    }

    public async module(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            if (DEMO_MODELS[id]) out[id] = DEMO_MODELS[id];
        }
        return out;
    }

    public async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            if (id === DEMO_TEXTURE_ID) out[id] = { type: 'texture', format: 'png', raw: '/assets/checker.png', repeat: [1, 1] };
        }
        return out;
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        this.engine = new Engine(containerId, { api: this, ui });

        this.engine.on('grid:need', (payload) => {
            this.handleGridRequest(payload.center);
        });
        this.engine.on('player:state', (state) => {
            this._saveState(state);
        });

        // Restore persisted player state.
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.playerState = { ...this.playerState, ...parsed };
                if (this.playerState.position[2] < -100) {
                    console.log('[Failsafe] Resetting player altitude from void...');
                    this.playerState.position[2] = 1.0;
                }
            } catch (e) {
                console.error('[DesktopLoader] Failed to parse saved player state', e);
            }
        }

        await this.engine.bootWorld(0, this.playerState);

        const world = this.engine.getWorld();

        const initialBKey = `${this.playerState.block[0]}_${this.playerState.block[1]}`;
        const blockReadyPromise = new Promise<void>((resolve) => {
            const onBlockReady = (event: any) => {
                const blockEntityId = event.blockId;
                const block = world?.getComponent<any>(blockEntityId, 'BlockComponent');
                if (block && block.x === this.playerState.block[0] && block.y === this.playerState.block[1]) {
                    this.engine?.off('world:block_ready', onBlockReady);
                    resolve();
                }
            };
            this.engine?.on('world:block_ready', onBlockReady);
            // Failsafe: proceed after 3s even if the ready signal never fires.
            setTimeout(resolve, 3000);
        });

        // Inject the initial neighborhood BEFORE starting physics (prevents falling).
        console.log(`[Loader] Pre-loading initial neighborhood for ${initialBKey}...`);
        await this.handleGridRequest(this.playerState.block);

        this.engine.start();

        await blockReadyPromise;
        console.log('[Loader] World Ready.');

        this.startEnvironmentClock();
    }

    /**
     * Mock chain-height clock (the engine is chain-decoupled, so there is no real
     * slot feed). The old engine derived time+weather from each new block height +
     * hash; here a ticker bumps a synthetic height every few seconds and feeds it
     * to EnvironmentSystem, so the sun arcs across a ~2-minute day/night cycle and
     * weather cycles. Replace with a real chain-height subscription when the chain
     * plugin ships.
     */
    private envHeight = 0;
    private envTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly ENV_TICK_MS = 2000;
    private static readonly ENV_INTERVAL = 1440; // game-seconds per tick (24 game-min) → ~120s/day

    private startEnvironmentClock() {
        if (this.envTimer) return;
        const tick = () => {
            this.envHeight += 1;
            this.engine?.feedChainState(this.envHeight, this.mockHash(this.envHeight), DesktopLoader.ENV_INTERVAL);
        };
        tick(); // kick once so time starts advancing from boot, not after the first delay
        this.envTimer = setInterval(tick, DesktopLoader.ENV_TICK_MS);
    }

    /**
     * Synthetic block hash whose weather slices (chars 12–15, per
     * EnvironmentSystem.simulateWeatherHash) cycle clear → cloud → rain → snow
     * every 10 ticks, so weather visibly changes in the no-chain client.
     */
    private mockHash(height: number): string {
        const catIdx = Math.floor(height / 10) % 4;          // 0 clear · 1 cloud · 2 rain · 3 snow
        const catHex = catIdx.toString(16).padStart(2, '0'); // occupies hash chars [12,13]
        return '0x' + 'a'.repeat(10) + catHex + '02' + 'a'.repeat(48);
    }

    private async handleGridRequest(center: [number, number]) {
        if (!this.engine) return;
        const extend = this.playerState.extend;
        const requiredKeys: string[] = [];

        for (let dx = -extend; dx <= extend; dx++) {
            for (let dy = -extend; dy <= extend; dy++) {
                requiredKeys.push(`${center[0] + dx}_${center[1] + dy}`);
            }
        }

        (this.engine.getWorld() as any)?.blocks.syncVisibility(requiredKeys);

        // Hide-then-timestamp-then-evict: in-window blocks are kept fresh; blocks
        // that have been OUT of the window past the TTL are destroyed to bound memory
        // (recently-left blocks stay loaded+hidden for instant re-entry).
        const now = Date.now();
        const required = new Set(requiredKeys);
        for (const k of requiredKeys) this.blockLastSeen.set(k, now);
        for (const k of [...this.loadedBlockKeys]) {
            if (required.has(k)) continue;
            if (now - (this.blockLastSeen.get(k) ?? now) > DesktopLoader.EVICT_TTL_MS) {
                const [ex, ey] = k.split('_').map(Number);
                this.engine.removeBlock(ex, ey);
                this.loadedBlockKeys.delete(k);
                this.blockLastSeen.delete(k);
            }
        }

        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k) && !this.fetchingBlockKeys.has(k));
        if (missing.length === 0) return;

        missing.forEach(k => this.fetchingBlockKeys.add(k));

        const results = await Promise.all(missing.map(k => {
            const [cx, cy] = k.split('_').map(Number);
            return this.fetchBlock(cx, cy);
        }));

        results.forEach(data => {
            this.engine?.injectBlock({ ...data, adjuncts: data.raw });
            const key = `${data.x}_${data.y}`;
            this.loadedBlockKeys.add(key);
            this.fetchingBlockKeys.delete(key);
        });
    }

    // The single data seam. Chain-free: always local mock.
    // (Phase 1 of the decoupling plan replaces this with a DraftStorage-backed
    // LocalDataSource so edited blocks persist.)
    private async fetchBlock(x: number, y: number): Promise<any> {
        const data = await fetchMockBlock(x, y);
        if (x === DEMO_BLOCK[0] && y === DEMO_BLOCK[1]) this.injectDemoAssets(data);
        return data;
    }

    /**
     * Demo only: splice a few model instances + textured boxes into the spawn
     * block so the model/texture pipeline is visible in `npm run dev`. The 3
     * pyramids share ONE model file (load-once, instance-many); the wall + floor
     * slab share ONE texture (shared by reference, tiled by size-derived UVs).
     */
    private injectDemoAssets(data: any) {
        // [size, offset, rot, RESOURCE_ID, animate, stop]. oz lifts the base just
        // above ground (avoids coplanar z-fighting). Box size is matched to each
        // model's natural aspect so the per-axis scale-to-fit stays ~uniform (no
        // stretching) — pyramids are symmetric; helmet ≈ cubic; fox is elongated.
        // rot = [pitch(x), YAW(y, around vertical), roll(z)] — distinct yaw per
        // instance so you can see rotation correctly applied to loaded models and
        // view each from a different side. Applied AFTER scale-to-fit, so an
        // aspect-matched (≈uniform) model rotates cleanly with no shear.
        const Y = Math.PI;
        const modules = [
            // 3 pyramids share one .gltf (load-once, instance-many)
            [[2, 2, 3], [3, 12, 1.55], [0, 0.4, 0], 27, 0, 0],
            [[2, 2, 3], [8, 12, 1.55], [0, Y / 4, 0], 27, 0, 0],
            [[2, 2, 3], [13, 12, 1.55], [0, -0.6, 0], 27, 0, 0],
            // 2 damaged helmets (complex PBR) share one .glb — aspect ≈ cubic
            [[3.15, 3.33, 3.0], [6, 3, 1.55], [0, 0.6, 0], 28, 0, 0],
            [[3.15, 3.33, 3.0], [10, 3, 1.55], [0, -Y / 3, 0], 28, 0, 0],
            // 2 foxes (rigged) share one .glb — aspect ~1 : 6 : 3 (W:N:Alt)
            [[0.64, 3.92, 2.0], [2, 6, 1.05], [0, Y / 2, 0], 29, 0, 0],
            [[0.64, 3.92, 2.0], [14, 8, 1.05], [0, Y, 0], 29, 0, 0],
        ];
        const texturedBoxes = [
            // [size, pos, rot, colorIdx, repeat, animate, stop, TEXTURE_ID]
            [[6, 0.3, 4], [12, 5, 2], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],     // wall
            [[6, 6, 0.3], [3, 4, 0.15], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],   // floor slab
        ];
        data.raw[2].push([0x00a4, modules]);
        data.raw[2].push([0x00a2, texturedBoxes]);
    }

    // ── Player / view controls ─────────────────────────────────────────────────

    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
    }

    public toggleEditMode(active: boolean) {
        this.engine?.setEditMode(active);
    }

    public setCameraView(mode: 'first' | 'third') {
        this.engine?.setCameraView(mode);
    }

    /** Toggle first/third-person; returns the new mode. */
    public toggleCameraView(): 'first' | 'third' | undefined {
        return this.engine?.toggleCameraView();
    }

    public triggerPlayerJump() {
        this.engine?.jump();
    }

    public getPlayerRotationY(): number {
        if (!this.engine) return 0;
        const world = this.engine.getWorld();
        if (!world) return 0;
        const players = world.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        if (players.length === 0) return 0;
        const t = world.getComponent<TransformComponent>(players[0], 'TransformComponent');
        return t ? t.rotation[1] : 0;
    }

    public getLoadedBlockCount(): number {
        return this.loadedBlockKeys.size;
    }

    // ── Minimap ─────────────────────────────────────────────────────────────────

    public toggleMinimap(active: boolean) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        (world as any).pipeline.isMinimapActive = active;
        if (active) (world as any).minimap.setFollow(true);
    }

    public applyMinimapZoom(delta: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const currentZone = (world as any).minimap.zoom;
        (world as any).minimap.zoom = Math.max(0.2, Math.min(10, currentZone + delta));
    }

    public panMinimap(dx: number, dy: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const scale = (120 / 600) / (world as any).minimap.zoom;
        (world as any).minimap.applyPan(dx * scale, dy * scale);
        (world as any).minimap.setFollow(false);
    }

    public pickMinimapBlock(ndcX: number, ndcY: number) {
        if (!this.engine) return null;
        return (this.engine.getWorld() as any)?.minimap.pickBlockFromMinimap(ndcX, ndcY);
    }

    public resetMinimapFollow() {
        if (this.engine) (this.engine.getWorld() as any)?.minimap.setFollow(true);
    }

    // ── Persistence ──────────────────────────────────────────────────────────────

    private _saveState(partial: Partial<SPPPlayerState>) {
        this.playerState = { ...this.playerState, ...partial };
        if (!this.playerState.extend || this.playerState.extend < 2) {
            this.playerState.extend = 2;
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.playerState));
    }
}
