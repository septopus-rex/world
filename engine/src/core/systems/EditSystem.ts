import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { RenderHandle } from '../types/Adjunct';

/**
 * EditSystem
 * Controls the visual helpers and selection logic during Edit Mode.
 */
export class EditSystem implements ISystem {
    private activeBlockId: EntityId | null = null;
    private selectedEntityId: EntityId | null = null;

    private blockHelper: RenderHandle | null = null;
    private gridHelper: RenderHandle | null = null;
    private selectionHighlight: RenderHandle | null = null; // 1.1x BoxHelper
    private gridPlane: 'XZ' | 'XY' | 'YZ' = 'XZ';

    private lastClickTime: number = 0;
    private readonly DOUBLE_CLICK_DELAY = 300;

    private interactHandler: (event: GameEvent) => void;

    constructor(world: World) {
        this.interactHandler = (e) => this.onInteract(world, e.payload);
        world.on("interact", this.interactHandler);
    }

    public update(world: World, dt: number): void {
        if (!world.isEditMode) {
            this.clearHelpers(world);
            return;
        }

        // 1. Maintain Active Block (the one player is standing on)
        this.maintainActiveBlock(world);

        // 2. Sync visual positions
        this.syncHelpers(world);
    }

    private maintainActiveBlock(world: World) {
        // If we already have an active block, don't change it during Edit Mode!
        if (this.activeBlockId !== null) return;

        const playerEntities = world.getEntitiesWith(["InputStateComponent", "TransformComponent"]);
        if (playerEntities.length === 0) return;

        const playerPos = world.getComponent<TransformComponent>(playerEntities[0], "TransformComponent")!.position;
        const { block } = Coords.engineToSpp(playerPos);

        const blockEntities = world.queryEntities("BlockComponent");
        for (const eid of blockEntities) {
            const bComp = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (bComp && bComp.x === block[0] && bComp.y === block[1]) {
                this.activeBlockId = eid;
                world.activeEditBlockId = eid; // Sync with world for other systems
                break;
            }
        }
    }

    private syncHelpers(world: World) {
        // Block Highlight
        if (this.activeBlockId !== null && !this.blockHelper) {
            const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent");
            if (bComp && bComp.group) {
                this.blockHelper = world.renderEngine.createBlockHighlight(bComp.group, 16);
                // Center the highlight on the 16x16 block (Group is at SPP [0,0], block goes to [16,16])
                // SPP [8,8,0] -> Engine [8,0,-8]
                world.renderEngine.setObjectPosition(this.blockHelper, 8, 0, -8);
            }
        }

        // Grid & Selection Helpers follow selected
        if (this.selectedEntityId !== null) {
            const trans = world.getComponent<TransformComponent>(this.selectedEntityId, "TransformComponent");
            if (trans) {
                if (this.gridHelper) {
                    world.renderEngine.setObjectPosition(this.gridHelper, trans.position[0], trans.position[1], trans.position[2]);
                }
                if (this.selectionHighlight) {
                    world.renderEngine.setObjectPosition(this.selectionHighlight, trans.position[0], trans.position[1], trans.position[2]);
                }
            }
        }
    }

    private onInteract(world: World, data: any) {
        if (!world.isEditMode) return;

        const now = Date.now();
        const isDoubleClick = (now - this.lastClickTime) < this.DOUBLE_CLICK_DELAY;
        this.lastClickTime = now;

        if (isDoubleClick && this.selectedEntityId === data.entityId) {
            this.cycleGridPlane(world);
            return;
        }

        // Update selected
        this.selectedEntityId = data.entityId;
        this.createOrUpdateGridHelper(world);
    }

    private createOrUpdateGridHelper(world: World) {
        if (this.gridHelper) {
            world.renderEngine.removeHandle(this.gridHelper);
            this.gridHelper = null;
        }
        if (this.selectionHighlight) {
            world.renderEngine.removeHandle(this.selectionHighlight);
            this.selectionHighlight = null;
        }

        if (this.selectedEntityId === null) return;

        const adj = world.getComponent<AdjunctComponent>(this.selectedEntityId, "AdjunctComponent");
        const trans = world.getComponent<TransformComponent>(this.selectedEntityId, "TransformComponent");

        if (!trans) return;

        // Size the grid to roughly 4x4 meters for context
        this.gridHelper = world.renderEngine.createGridHelper(4, 8, 0x00ffff, 0x008888);
        world.renderEngine.setObjectPosition(this.gridHelper, trans.position[0], trans.position[1], trans.position[2]);

        // Add 1.1x BoxHelper for clear visual feedback
        const group = world.renderEngine.getObjectByEntityId(this.selectedEntityId);
        if (group) {
            this.selectionHighlight = world.renderEngine.createSelectionHighlight(group, 0x00ffff);
            world.renderEngine.setObjectPosition(this.selectionHighlight, trans.position[0], trans.position[1], trans.position[2]);
        }

        this.applyGridRotation();
    }

    private cycleGridPlane(world: World) {
        if (this.gridPlane === 'XZ') this.gridPlane = 'XY';
        else if (this.gridPlane === 'XY') this.gridPlane = 'YZ';
        else this.gridPlane = 'XZ';

        this.applyGridRotation();
    }

    private applyGridRotation() {
        if (!this.gridHelper) return;

        // THREE.GridHelper default is XZ
        if (this.gridPlane === 'XZ') {
            (this.gridHelper as any).rotation.set(0, 0, 0);
        } else if (this.gridPlane === 'XY') {
            (this.gridHelper as any).rotation.set(Math.PI / 2, 0, 0);
        } else if (this.gridPlane === 'YZ') {
            (this.gridHelper as any).rotation.set(0, 0, Math.PI / 2);
        }
    }

    private clearHelpers(world: World) {
        if (this.blockHelper) {
            world.renderEngine.removeHandle(this.blockHelper);
            this.blockHelper = null;
        }
        if (this.gridHelper) {
            world.renderEngine.removeHandle(this.gridHelper);
            this.gridHelper = null;
        }
        if (this.selectionHighlight) {
            world.renderEngine.removeHandle(this.selectionHighlight);
            this.selectionHighlight = null;
        }
        this.activeBlockId = null;
        world.activeEditBlockId = null; // Clear from world
        this.selectedEntityId = null;
    }
}
