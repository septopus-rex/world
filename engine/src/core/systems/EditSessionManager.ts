import { World, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { Coords } from '../utils/Coords';

/**
 * Manages session-level state for Edit Mode, specifically the "Active Block" lock.
 */
export class EditSessionManager {
    public activeBlockId: EntityId | null = null;

    constructor(private world: World) { }

    public maintain(activeBlockId: EntityId | null): EntityId | null {
        // If already locked, keep it
        if (this.activeBlockId !== null) return this.activeBlockId;

        const playerEntities = this.world.getEntitiesWith(["InputStateComponent", "TransformComponent"]);
        if (playerEntities.length === 0) return null;

        const playerPos = this.world.getComponent<TransformComponent>(playerEntities[0], "TransformComponent")!.position;
        const { block } = Coords.engineToSpp(playerPos);

        const blockEntities = this.world.queryEntities("BlockComponent");
        for (const eid of blockEntities) {
            const bComp = this.world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (bComp && bComp.x === block[0] && bComp.y === block[1]) {
                console.log(`[EditSession] Session Locked to Block: ${eid} at [${block[0]}, ${block[1]}]`);
                this.activeBlockId = eid;
                return eid;
            }
        }
        return null;
    }

    public clear() {
        this.activeBlockId = null;
    }
}
