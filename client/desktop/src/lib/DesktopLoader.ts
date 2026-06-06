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

    public playerState: SPPPlayerState = { ...DEFAULT_PLAYER_STATE };

    // ── IDataSource ───────────────────────────────────────────────────────────

    public async world(_index: number): Promise<any> {
        // Local Genesis world config.
        return JSON.parse(JSON.stringify(MockWorldNormal));
    }

    public async view(_x: number, _y: number, _ext: number, _worldIndex: number): Promise<any> {
        // Neighborhood fetching is driven by handleGridRequest below.
        return null;
    }

    public async module(_ids: number[]): Promise<any> { return {}; }
    public async texture(_ids: number[]): Promise<any> { return {}; }

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
        return fetchMockBlock(x, y);
    }

    // ── Player / view controls ─────────────────────────────────────────────────

    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
    }

    public toggleEditMode(active: boolean) {
        this.engine?.setEditMode(active);
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
