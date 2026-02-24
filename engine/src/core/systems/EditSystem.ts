import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent, InputStateComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { RenderHandle } from '../types/Adjunct';
import { GlobalConfig } from '../GlobalConfig';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';

/**
 * EditSystem
 * Controls the visual helpers and selection logic during Edit Mode.
 */
export class EditSystem implements ISystem {
    private activeBlockId: EntityId | null = null;
    private selectedEntityId: EntityId | null = null;
    private movingEntityId: EntityId | null = null;

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
        if (world.mode !== SystemMode.Edit) {
            this.clearHelpers(world);
            return;
        }

        // 1. Maintain Active Block (the one player is standing on)
        this.maintainActiveBlock(world);

        // 2. Handle Movement if entity being moved
        if (this.movingEntityId !== null) {
            this.handleMovement(world);
        }

        // 3. Sync visual positions
        this.syncHelpers(world);
    }

    private handleMovement(world: World) {
        if (this.movingEntityId === null || this.activeBlockId === null) return;

        const playerEntities = world.getEntitiesWith(["InputStateComponent", "TransformComponent"]);
        if (playerEntities.length === 0) return;

        const input = world.getComponent<InputStateComponent>(playerEntities[0], "InputStateComponent")!;
        const trans = world.getComponent<TransformComponent>(this.movingEntityId, "TransformComponent")!;

        // Determine plane parameters
        let normal: [number, number, number] = [0, 1, 0];
        let planePoint: [number, number, number] = [...trans.position];

        if (this.gridPlane === 'XZ') {
            normal = [0, 1, 0];
            const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent")!;
            planePoint[1] = bComp.elevation || 0; // Move on ground plane
        } else if (this.gridPlane === 'XY') {
            normal = [0, 0, 1];
        } else if (this.gridPlane === 'YZ') {
            normal = [1, 0, 0];
        }

        // Project ray onto plane
        const hit = world.renderEngine.intersectRayWithPlane(
            input.mouseNDC[0],
            input.mouseNDC[1],
            normal,
            planePoint
        );

        if (hit) {
            const playerPos = world.getComponent<TransformComponent>(playerEntities[0], "TransformComponent")!.position;
            const distSq = (hit[0] - playerPos[0]) ** 2 + (hit[1] - playerPos[1]) ** 2 + (hit[2] - playerPos[2]) ** 2;

            // Limit movement distance to 12 meters to prevent flying to infinity
            if (distSq > 12 * 12) return;

            const res = CONTROL_CONSTANTS.GRID_SNAP_RESOLUTION;
            const bId = this.activeBlockId;
            const bComp = world.getComponent<BlockComponent>(bId, "BlockComponent")!;
            const [bw, bl] = GlobalConfig.world.block;
            const bWorldPos = Coords.sppToEngine([0, 0, 0], [bComp.x, bComp.y]);

            // Snap the hit point
            let newX = Coords.snapToGrid(hit[0], res);
            let newY = Coords.snapToGrid(hit[1], res);
            let newZ = Coords.snapToGrid(hit[2], res);

            // Constrain to block boundaries (X and Z) if on XZ plane
            if (this.gridPlane === 'XZ') {
                newX = Math.max(bWorldPos[0], Math.min(bWorldPos[0] + bw, newX));
                newZ = Math.min(bWorldPos[2], Math.max(bWorldPos[2] - bl, newZ));
                newY = planePoint[1]; // Keep on ground
            }

            trans.position[0] = newX;
            trans.position[1] = newY;
            trans.position[2] = newZ;
        }
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
        // 1. Block Highlight
        if (this.activeBlockId !== null && !this.blockHelper) {
            const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent");
            if (bComp && bComp.group) {
                const [bw, bl, bh] = GlobalConfig.world.block;
                // Standard 3D Protocol: createBlockHighlight now handles centering internally
                this.blockHelper = world.renderEngine.createBlockHighlight(bComp.group, bw, bh);
            }
        }

        // 2. Grid Helper "slices" through selected adjunct OR stays at block base
        if (this.activeBlockId !== null && this.gridHelper) {
            this.positionGridAtBlock(world);
        }

        // 3. Selection Highlight follows selected
        if (this.selectedEntityId !== null) {
            const trans = world.getComponent<TransformComponent>(this.selectedEntityId, "TransformComponent");
            if (trans && this.selectionHighlight) {
                world.renderEngine.setObjectPosition(this.selectionHighlight, trans.position[0], trans.position[1], trans.position[2]);
            }
        }
    }

    private onInteract(world: World, data: any) {
        if (world.mode !== SystemMode.Edit) return;

        const now = Date.now();
        const isDoubleClick = (now - this.lastClickTime) < this.DOUBLE_CLICK_DELAY;
        this.lastClickTime = now;

        // Plane swap on double click
        if (isDoubleClick && this.selectedEntityId === data.entityId) {
            this.cycleGridPlane(world);
            // Reverse the movement toggle caused by the first click of the double click
            this.movingEntityId = this.movingEntityId ? null : this.selectedEntityId;
            world.isMovingObject = !!this.movingEntityId;
            return;
        }

        // Deselection: If clicked nothing or something that isn't a valid selection
        if (data.entityId === null) {
            this.selectedEntityId = null;
            this.movingEntityId = null;
            world.isMovingObject = false;
            this.createOrUpdateGridHelper(world);
            return;
        }

        // Action Mapping:
        // 1. If not selected -> Select
        // 2. If already selected -> Toggle movement (Pick up/Drop)
        if (this.selectedEntityId !== data.entityId) {
            this.selectedEntityId = data.entityId;
            this.movingEntityId = null;
            world.isMovingObject = false;
        } else {
            this.movingEntityId = this.movingEntityId ? null : data.entityId;
            world.isMovingObject = !!this.movingEntityId;
        }

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

        if (this.activeBlockId === null) return;
        const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent")!;
        const [bw, bl, bh] = GlobalConfig.world.block;

        // 1. Grid Helper
        if (this.gridHelper === null) {
            const gridSize = bw;
            const divisions = 8;
            this.gridHelper = world.renderEngine.createGridHelper(gridSize, divisions, 0x00ffff, 0x008888);
        }

        // Position grid at the block reference point
        this.positionGridAtBlock(world);

        // 2. Selection Highlight (Follows adjunct)
        if (this.selectedEntityId !== null) {
            const trans = world.getComponent<TransformComponent>(this.selectedEntityId, "TransformComponent");
            const group = world.renderEngine.getObjectByEntityId(this.selectedEntityId);
            if (trans && group) {
                this.selectionHighlight = world.renderEngine.createSelectionHighlight(group, 0x00ffff);
                world.renderEngine.setObjectPosition(this.selectionHighlight, trans.position[0], trans.position[1], trans.position[2]);
            }
        }
    }

    private positionGridAtBlock(world: World) {
        if (!this.gridHelper || this.activeBlockId === null) return;
        const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent")!;
        const [bw, bl, bh] = GlobalConfig.world.block;
        const bWorldPos = Coords.sppToEngine([0, 0, 0], [bComp.x, bComp.y]);
        const elevation = bComp.elevation || 0;
        const offset = 0.01;

        // Normal Attachment: Grid follows adjunct's depth on the normal axis
        let depthY = elevation;
        let depthZ = bWorldPos[2];
        let depthX = bWorldPos[0];

        if (this.selectedEntityId !== null) {
            const trans = world.getComponent<TransformComponent>(this.selectedEntityId, "TransformComponent");
            if (trans) {
                depthY = trans.position[1];
                depthZ = trans.position[2];
                depthX = trans.position[0];
            }
        }

        if (this.gridPlane === 'XZ') {
            // Planar center matches block center, Normal (Y) follows adjunct
            world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, depthY + offset, bWorldPos[2] - bl / 2);
        } else if (this.gridPlane === 'XY') {
            // Planar center matches block center, Normal (Z) follows adjunct
            world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, elevation + bh / 2, depthZ + offset);
        } else {
            // Planar center matches block center, Normal (X) follows adjunct
            world.renderEngine.setObjectPosition(this.gridHelper, depthX + offset, elevation + bh / 2, bWorldPos[2] - bl / 2);
        }
        this.applyGridRotation();
    }

    private positionGridAt(world: World, pos: [number, number, number]) {
        // Redundant - removed in favor of block-absolute positioning
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
        world.activeEditBlockId = null;
        this.selectedEntityId = null;
        this.movingEntityId = null;
        world.isMovingObject = false;
    }
}
