import { Engine } from '../../engine/src/Engine';
import type { BlockComponent } from '../../engine/src/core/components/BlockComponent';
import { TransformComponent } from '../../engine/src/core/components/PlayerComponents';
import { Coords } from '../../engine/src/core/utils/Coords';
import { MockWorldNormal } from '../../engine/src/core/mocks/WorldConfigs';
import { IDataSource } from '../../engine/src/core/services/DataSource';

import { fetchEmptyBlock } from './lib/api';
// Using local MockBlockData definition

export interface SPPPlayerState {
    block: [number, number];
    world: string | number;
    position: [number, number, number]; // [X, Y, Z] (X=East, Y=North, Z=Alt)
    rotation: [number, number, number]; // [X, Y, Z] (Euler Z-Up)
    stop: { on: boolean; adjunct: string; index: number };
    extend: number;
    posture: number;
}

export interface MockBlockData {
    x: number;
    y: number;
    elevation: number;
    adjuncts: any[];
}

export class SandboxLoader implements IDataSource {
    public engine: Engine | null = null;
    private readonly STORAGE_KEY = "spp_player_state";

    // Registry of loaded block keys for tracking
    private loadedBlockKeys: Set<string> = new Set();

    // The player's full SPP state (Z-Up coordinate convention)
    public playerState: SPPPlayerState = {
        block: [2048, 2048],
        world: 'main',
        position: [8, 8, 0.5], // [X, Y, Z] -> [East, North, Altitude]
        rotation: [0, 0, 0],
        stop: { on: false, adjunct: "", index: 0 },
        extend: 1, // Default loading radius (3x3)
        posture: 0 // Standing
    };

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
            ui: ui || {
                show: (type: string, content: any) => console.log(`[UI SHOW] ${type}:`, content),
                hide: (type: string) => console.log(`[UI HIDE] ${type}`)
            }
        });

        // 2. Autonomous Event Handlers
        this.engine.on("grid:need", (payload) => {
            this.handleGridRequest(payload.center);
        });

        this.engine.on("player:state", (state) => {
            this.playerState = { ...this.playerState, ...state };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.playerState));
        });

        // 3. Load persistence
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.playerState = { ...this.playerState, ...parsed };
            } catch (e) {
                console.error("[SandboxLoader] Failed to parse saved player state", e);
            }
        }

        // 4. Boot World (Pass RAW SPP coordinates. Engine handles global conversion via Coords.ts)
        await this.engine.bootWorld(0, this.playerState);

        const world = this.engine.getWorld();

        // 5. Wait for first block to be VISUALLY ready

        // 6. Force initial neighborhood request and WAIT for first block to be VISUALLY ready
        const initialBKey = `${this.playerState.block[0]}_${this.playerState.block[1]}`;

        console.log(`[Loader] Waiting for initial block ${initialBKey}...`);

        const blockReadyPromise = new Promise<void>((resolve) => {
            const onBlockReady = (event: any) => {
                const blockEntityId = event.payload.blockId;
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

        await this.handleGridRequest(this.playerState.block);
        await blockReadyPromise;

        // 7. Finally start the physics simulation
        console.log("[Loader] World Ready. Starting Engine.");
        this.engine.start();
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
        this.engine.getWorld()?.blocks.syncVisibility(requiredKeys);

        // Fetch and inject missing blocks
        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k));
        const results = await Promise.all(missing.map(k => {
            const [cx, cy] = k.split('_').map(Number);
            return fetchMockBlock(cx, cy);
        }));

        results.forEach(data => {
            this.engine?.injectBlock(data);
            this.loadedBlockKeys.add(`${data.x}_${data.y}`);
        });
    }


    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
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
        world.pipeline.isMinimapActive = active;
        if (active) {
            world.minimap.setFollow(true);
        }
    }

    public applyMinimapZoom(delta: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const currentZone = world.minimap.zoom;
        const nextZoom = Math.max(0.2, Math.min(10, currentZone + delta));
        world.minimap.zoom = nextZoom;
    }

    public panMinimap(dx: number, dy: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const scale = (120 / 600) / world.minimap.zoom;
        world.minimap.applyPan(dx * scale, dy * scale);
        world.minimap.setFollow(false);
    }

    public pickMinimapBlock(ndcX: number, ndcY: number) {
        if (!this.engine) return null;
        return this.engine.getWorld()?.minimap.pickBlockFromMinimap(ndcX, ndcY);
    }

    public resetMinimapFollow() {
        if (this.engine) this.engine.getWorld()?.minimap.setFollow(true);
    }
}

/**
 * Mocking a dynamic world service that returns varying elevations and adjuncts.
 */
async function fetchMockBlock(x: number, y: number): Promise<MockBlockData> {
    // Flatten world for dynamic loading tests (Zero elevation)
    const hash = (x * 71 + y * 131);
    const elevation = 0;

    const adjuncts: any[] = [];

    // Add a random pillar in the center
    if (hash % 2 === 0) {
        adjuncts.push({
            id: `pillar_${x}_${y}`,
            type: "box",
            params: {
                size: [2, 10, 2],
                position: [8, 8, 5], // Center [X, Y], Height [Z]
                rotation: [0, 0, 0]
            }
        });
    }

    return {
        x,
        y,
        elevation,
        adjuncts
    };
}
