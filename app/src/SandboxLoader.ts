import { World } from '../../engine/src/core/World';
import type { AdjunctComponent } from '../../engine/src/core/components/AdjunctComponents';
import type { TransformComponent } from '../../engine/src/core/components/PlayerComponents';
import { BasicBoxAdjunct } from '../../engine/src/plugins/adjunct/basic_box';
import { MockWorldNormal } from '../../engine/src/core/mocks/WorldConfigs';

import { fetchEmptyBlock } from './lib/api';
import type { MockBlockData } from './lib/api';

export class SandboxLoader {
    public world: World | null = null;

    // Constant physical size representing a single generic unit Block
    public readonly BLOCK_SIZE = 20;

    // Registry of loaded blocks "x_y" to avoid duplicate ECS spawns
    private loadedBlocks: Set<string> = new Set();

    // The player's logical global coordinate in the simulated network
    public currentBlockCoordinate: { x: number, y: number, world: string } = { x: 2026, y: 222, world: 'main' };

    // How many rings of blocks to render around the player's core block (n=1 means 3x3)
    public extendN: number = 1;

    public init(containerId: string) {
        if (this.world) return;

        // 1. Initialize ECS World with valid Mock Config
        const config = JSON.parse(JSON.stringify(MockWorldNormal));
        config.world.containerId = containerId;

        this.world = new World(config);

        // 2. Start the automated tracker that streams surrounding blocks.
        // It operates independently, constantly evaluating the player's physical boundary
        this.startStreamingService();
    }

    private _streamingInterval: any;

    /**
     * Periodically tracks player physical X/Z world location, maps it back into [BlockX, BlockY] logical coordinates,
     * checks for boundaries, and asynchronously streams missing grids.
     */
    private startStreamingService() {
        // Initial manual load
        this.checkAndLoadMissingBlocks();

        // 10 times a sec, query physical boundaries
        this._streamingInterval = setInterval(() => {
            if (!this.world) return;

            // Get player's absolute physical center
            const players = this.world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
            if (players.length === 0) return;

            const t = this.world.getComponent<TransformComponent>(players[0], "TransformComponent");
            if (!t) return;

            // Engine offset calculation: 
            // In ThreeJS, coordinates revolve around 0,0.
            // If the player starts at Block [2026, 222], physics is [0, 0, 0].
            // If physics becomes X=25, they went right into Block [2027, 222].
            // Mapping Logic: physical offset / BLOCK_SIZE -> Math.floor to get logical delta.
            const physicsX = t.position[0];
            const physicsZ = t.position[2];

            // Local block offset relative to initial spawn
            const localBlockOffsetX = Math.floor(physicsX / this.BLOCK_SIZE + 0.5) || 0;
            const localBlockOffsetY = Math.floor(physicsZ / this.BLOCK_SIZE + 0.5) || 0;

            // New absolute coordinates
            const nextX = 2026 + localBlockOffsetX;
            const nextY = 222 + localBlockOffsetY;

            if (nextX !== this.currentBlockCoordinate.x || nextY !== this.currentBlockCoordinate.y) {
                // Crossed a boundary
                this.currentBlockCoordinate.x = nextX;
                this.currentBlockCoordinate.y = nextY;

                // Immediately enqueue loading missing grid
                this.checkAndLoadMissingBlocks();
            }

        }, 100);
    }

    /**
     * Determines the Required Grid based on Extend[n], compares against `loadedBlocks`,
     * and fetches the diff async without purging cached blocks.
     */
    private async checkAndLoadMissingBlocks() {
        const requiredBlocks: string[] = [];
        const { x, y, world } = this.currentBlockCoordinate;

        for (let dx = -this.extendN; dx <= this.extendN; dx++) {
            for (let dy = -this.extendN; dy <= this.extendN; dy++) {
                const targetX = x + dx;
                const targetY = y + dy;
                requiredBlocks.push(`${targetX}_${targetY}`);
            }
        }

        // Identify which required chunks are not yet loaded
        const missing = requiredBlocks.filter(b => !this.loadedBlocks.has(b));

        // Fetch missing chunks concurrently
        const fetchPromises = missing.map(bKey => {
            const [strX, strY] = bKey.split('_');
            return fetchEmptyBlock(parseInt(strX), parseInt(strY), world);
        });

        if (fetchPromises.length === 0) return;

        const incomingGrids = await Promise.all(fetchPromises);

        // Push resolved chunks directly into ECS memory
        for (const data of incomingGrids) {
            this.instantiateBlockChunk(data);
            this.loadedBlocks.add(`${data.x}_${data.y}`);
        }
    }

    /**
     * Safely translates the SPP block into ThreeJS instances offset properly
     */
    private instantiateBlockChunk(block: MockBlockData) {
        if (!this.world) return;

        // Origin of the map mathematically aligns with [2026, 222] = (0, 0)
        const baseX = 2026;
        const baseY = 222;

        const offsetX = (block.x - baseX) * this.BLOCK_SIZE;
        const offsetZ = (block.y - baseY) * this.BLOCK_SIZE;

        block.adjuncts.forEach((data: any) => {
            const eid = this.world!.createEntity();

            const localPos = data.params.position || [0, 0, 0];
            const finalPos = [
                localPos[0] + offsetX,
                localPos[1],
                localPos[2] + offsetZ
            ];

            this.world!.addComponent<TransformComponent>(eid, "TransformComponent", {
                position: finalPos as [number, number, number],
                rotation: (data.params.rotation || [0, 0, 0]) as [number, number, number],
                scale: [1, 1, 1]
            });

            this.world!.addComponent<AdjunctComponent>(eid, "AdjunctComponent", {
                adjunctId: data.id || `gen_${Math.random()}`,
                isInitialized: false,
                logicModule: BasicBoxAdjunct,
                stdData: data
            });
        });
    }

    /**
     * Bridges React Virtual Joystick inputs directly to the ECS InputState component of the Player.
     * Maps [-1, 1] Cartesian inputs to directional booleans.
     */
    public setPlayerMoveIntent(x: number, y: number) {
        if (!this.world) return;

        // Find the player entity (it's the only one with an InputStateComponent by default)
        const players = this.world.getEntitiesWith(["InputStateComponent"]);
        if (players.length === 0) return;

        const input = this.world.getComponent<any>(players[0], "InputStateComponent");
        if (input) {
            const deadzone = 0.2;
            input.right = x > deadzone;
            input.left = x < -deadzone;
            input.forward = y > deadzone;   // Positive Y from Joystick is UP (forward)
            input.backward = y < -deadzone; // Negative Y from Joystick is DOWN (backward)
        }
    }

    public triggerPlayerJump() {
        if (!this.world) return;
        const players = this.world.getEntitiesWith(["InputStateComponent"]);
        if (players.length === 0) return;

        const input = this.world.getComponent<any>(players[0], "InputStateComponent");
        if (input) {
            input.jump = true;
        }
    }

    public getPlayerRotationY(): number {
        if (!this.world) return 0;
        const players = this.world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (players.length === 0) return 0;

        const transform = this.world.getComponent<TransformComponent>(players[0], "TransformComponent");
        if (transform) {
            return transform.rotation[1]; // Return Yaw
        }
        return 0;
    }

    public toggleMinimap(active: boolean) {
        if (!this.world) return;
        this.world.pipeline.isMinimapActive = active;
        if (active) {
            this.world.minimap.setFollow(true);
        }
    }

    public applyMinimapZoom(delta: number) {
        if (!this.world) return;
        const currentZone = this.world.minimap.zoom;
        const nextZoom = Math.max(0.2, Math.min(10, currentZone + delta));
        this.world.minimap.zoom = nextZoom;
    }

    public panMinimap(dx: number, dy: number) {
        if (!this.world) return;
        // Convert screen pixels roughly to world units based on current zoom
        // (Initial frustum is 120 units, map size in UI is approx 600px)
        const scale = (120 / 600) / this.world.minimap.zoom;
        this.world.minimap.applyPan(dx * scale, dy * scale);
        // Once we pan, we stop following the player automatically
        this.world.minimap.setFollow(false);
    }

    public pickMinimapBlock(ndcX: number, ndcY: number) {
        if (!this.world) return null;
        return this.world.minimap.pickBlockFromMinimap(ndcX, ndcY);
    }

    public resetMinimapFollow() {
        if (this.world) this.world.minimap.setFollow(true);
    }

}
