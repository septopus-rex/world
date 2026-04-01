import { Engine } from '../../engine/src/Engine';
import type { BlockComponent } from '../../engine/src/core/components/BlockComponent';
import { TransformComponent } from '../../engine/src/core/components/PlayerComponents';
import { Coords } from '../../engine/src/core/utils/Coords';
import { MockWorldNormal } from '../../engine/src/core/mocks/WorldConfigs';
import { IDataSource } from '../../engine/src/core/services/DataSource';

import { fetchEmptyBlock } from './lib/api';
import { fetchMockBlock, MockBlockData } from '../../engine/src/core/mocks/BlockMocks';

export interface SPPPlayerState {
    block: [number, number];
    world: string | number;
    position: [number, number, number]; // [X, Y, Z] (X=East, Y=North, Z=Alt)
    rotation: [number, number, number]; // [X, Y, Z] (Euler Z-Up)
    stop: { on: boolean; adjunct: string; index: number };
    extend: number;
    posture: number;
}


import { DEFAULT_PLAYER_STATE, STORAGE_KEYS } from './Constants';

export class SandboxLoader implements IDataSource {
    public engine: Engine | null = null;
    private readonly STORAGE_KEY = STORAGE_KEYS.PLAYER_STATE;

    // Registry of loaded block keys for tracking
    private loadedBlockKeys: Set<string> = new Set();
    private fetchingBlockKeys: Set<string> = new Set();

    // The player's full SPP state (Z-Up coordinate convention)
    public playerState: SPPPlayerState = { ...DEFAULT_PLAYER_STATE };

    // Tracker for previously computed block to detect crossing
    private lastBlockKey: string = "";


    /**
     * Engine Data Source Implementation
     */
    public async world(index: number): Promise<any> {
        // Mock: Return Genesis world for index 0
        return JSON.parse(JSON.stringify(MockWorldNormal));
    }

    public async view(x: number, y: number, ext: number, worldIndex: number): Promise<any> {
        // Logic for neighborhood fetching (moved to handleGridRequest for now)
        return null;
    }

    public async module(ids: number[]): Promise<any> { return {}; }
    public async texture(ids: number[]): Promise<any> { return {}; }

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        // 1. Initialize Engine Wrapper
        this.engine = new Engine(containerId, {
            api: this,
            ui: ui // If undefined, engine will use built-in DefaultUIProvider
        });

        // 2. Autonomous Event Handlers
        this.engine.on("grid:need", (payload) => {
            this.handleGridRequest(payload.center);
        });

        this.engine.on("player:state", (state) => {
            this._saveState(state);
        });

        // 3. Load persistence
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.playerState = { ...this.playerState, ...parsed };

                // Failsafe: Reset altitude if player is way below ground level (prevents stuck-in-void after refactors)
                if (this.playerState.position[2] < -100) {
                    console.log("[Failsafe] Resetting player altitude from void...");
                    this.playerState.position[2] = 1.0;
                }
            } catch (e) {
                console.error("[SandboxLoader] Failed to parse saved player state", e);
            }
        }

        // 4. Boot World (Pass RAW SPP coordinates. Engine handles global conversion via Coords.ts)
        await this.engine.bootWorld(0, this.playerState);

        const world = this.engine.getWorld();

        // 5. Setup "Block Ready" Promise
        const initialBKey = `${this.playerState.block[0]}_${this.playerState.block[1]}`;
        const blockReadyPromise = new Promise<void>((resolve) => {
            const onBlockReady = (event: any) => {
                const blockEntityId = event.blockId;
                const block = world?.getComponent<any>(blockEntityId, "BlockComponent");
                if (block && block.x === this.playerState.block[0] && block.y === this.playerState.block[1]) {
                    this.engine?.off("world:block_ready", onBlockReady);
                    resolve();
                }
            };
            this.engine?.on("world:block_ready", onBlockReady);

            // Failsafe: if block doesn't load in 3s, proceed anyway
            setTimeout(resolve, 3000);
        });

        // 6. Manual Initial Fetch (Inject entities BEFORE starting physics to prevent falling)
        console.log(`[Loader] Pre-loading initial neighborhood for ${initialBKey}...`);
        await this.handleGridRequest(this.playerState.block);

        // 7. Start the engine loop so ECS systems can process injection & render
        console.log("[Loader] Systems ready. Starting Engine loop.");
        this.engine.start();

        // 8. Wait for the visual signal that the primary block is rendered
        await blockReadyPromise;
        console.log("[Loader] World Ready.");
    }

    private async handleGridRequest(center: [number, number]) {
        if (!this.engine) return;
        const extend = this.playerState.extend;
        const requiredKeys = [];

        for (let dx = -extend; dx <= extend; dx++) {
            for (let dy = -extend; dy <= extend; dy++) {
                const bx = center[0] + dx;
                const by = center[1] + dy;
                const bKey = `${bx}_${by}`;
                requiredKeys.push(bKey);
            }
        }

        // Logical culling in Engine
        (this.engine.getWorld() as any)?.blocks.syncVisibility(requiredKeys);

        // Fetch and inject missing blocks
        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k) && !this.fetchingBlockKeys.has(k));
        if (missing.length === 0) return;

        // Lock these keys so parallel requests (e.g. from event + init) don't duplicate
        missing.forEach(k => this.fetchingBlockKeys.add(k));

        const results = await Promise.all(missing.map(k => {
            const [cx, cy] = k.split('_').map(Number);
            return fetchMockBlock(cx, cy);
        }));

        results.forEach(data => {
            this.engine?.injectBlock({
                ...data,
                adjuncts: data.raw // Use complete raw array [elev, status, adj, anim]
            });
            const key = `${data.x}_${data.y}`;
            this.loadedBlockKeys.add(key);
            this.fetchingBlockKeys.delete(key);
        });
    }


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
        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (players.length === 0) return 0;
        const t = world.getComponent<TransformComponent>(players[0], "TransformComponent");
        return t ? t.rotation[1] : 0;
    }

    public getLoadedBlockCount(): number {
        return this.loadedBlockKeys.size;
    }

    public toggleMinimap(active: boolean) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        (world as any).pipeline.isMinimapActive = active;
        if (active) {
            (world as any).minimap.setFollow(true);
        }
    }

    public applyMinimapZoom(delta: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const currentZone = (world as any).minimap.zoom;
        const nextZoom = Math.max(0.2, Math.min(10, currentZone + delta));
        (world as any).minimap.zoom = nextZoom;
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

    private _saveState(partial: Partial<SPPPlayerState>) {
        this.playerState = { ...this.playerState, ...partial };

        // Force Guard: Never allow extend to be less than 2
        if (!this.playerState.extend || this.playerState.extend < 2) {
            this.playerState.extend = 2;
        }

        // console.log(`[Storage] Syncing player state (extend: ${this.playerState.extend})`, this.playerState);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.playerState));
    }
}

