import { World } from './World';
import { MinimapSystem } from './systems/MinimapSystem';
import { InputStateComponent } from './components/PlayerComponents';

/**
 * WorldBridge: High-level API facade for the UI and external loaders.
 * Extracted from World.ts to keep the core orchestrator minimal.
 */
export class WorldBridge {
    constructor(private world: World) { }

    public get controls() {
        return {
            setMoveIntent: (x: number, y: number) => {
                const player = this.world.queryEntities("InputStateComponent")[0];
                const input = this.world.getComponent<InputStateComponent>(player, "InputStateComponent");
                if (input) input.movementIntent = [x, 0, y];
            },
            triggerJump: () => {
                const player = this.world.queryEntities("InputStateComponent")[0];
                const input = this.world.getComponent<InputStateComponent>(player, "InputStateComponent");
                if (input) input.jump = true;
            },
            lock: () => this.world.renderEngine.lockControls?.(),
            unlock: () => this.world.renderEngine.unlockControls?.()
        };
    }

    public get minimap() {
        const getSystem = () => this.world.systems.findSystem(MinimapSystem);
        return {
            setFollow: (follow: boolean) => {
                const system = getSystem();
                if (system) system.isFollowingPlayer = follow;
            },
            applyPan: (dx: number, dy: number) => {
                const system = getSystem();
                if (system) system.applyPan(dx, dy);
            },
            pickBlockFromMinimap: (ndcX: number, ndcY: number) => {
                const system = getSystem();
                return system ? system.pickBlockFromMinimap(ndcX, ndcY) : null;
            },
            get zoom() {
                const system = getSystem();
                return system ? system.zoom : 1.0;
            },
            set zoom(val: number) {
                const system = getSystem();
                if (system) system.zoom = val;
            }
        };
    }

    public get blocks() {
        return {
            syncVisibility: (requiredKeys: string[]) => {
                const blockSystem = this.world.systems.findSystemByName("BlockSystem") as any;
                if (blockSystem && blockSystem.syncVisibility) {
                    blockSystem.syncVisibility(this.world, requiredKeys);
                }
            }
        };
    }
}
