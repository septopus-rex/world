import { World, ISystem } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { Coords } from '../utils/Coords';

/**
 * GridSystem monitors the player's physical location and calculates 
 * which logical blocks [X, Y] are required.
 * It emits events when boundaries are crossed.
 */
export class GridSystem implements ISystem {
    private lastBlockKey: string = "";
    private readonly BLOCK_SIZE = 16;
    private checkTimer: number = 0;
    private readonly CHECK_INTERVAL = 0.1; // 10Hz

    public update(world: World, dt: number): void {
        this.checkTimer += dt;
        if (this.checkTimer < this.CHECK_INTERVAL) return;
        this.checkTimer = 0;

        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (players.length === 0) return;

        const t = world.getComponent<TransformComponent>(players[0], "TransformComponent");
        if (!t) return;

        const spp = Coords.engineToSeptopus([t.position[0], t.position[1], t.position[2]]);
        const blockX = spp.block[0];
        const blockY = spp.block[1];

        const currentKey = `${blockX}_${blockY}`;

        // NOTE: player:state is emitted ONLY by CharacterController.processPersistence
        // (movement-thresholded, rotation properly converted via engineRotationToSeptopus).
        // A second unthrottled emitter here used to spam raw engine-axis rotations
        // into the same persistence channel.

        if (currentKey !== this.lastBlockKey) {
            this.lastBlockKey = currentKey;

            // Notify the loader that we need a specific neighborhood (block.need
            // is a boundary channel — DesktopLoader subscribes via the Engine facade).
            world.events.emit("block.need", {
                center: [blockX, blockY],
                key: currentKey
            });
        }
    }
}
