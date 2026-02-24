import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent, InputStateComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { UIButtonConfig } from '../services/UIProvider';
import { EditHelperManager } from './EditHelperManager';
import { EditSessionManager } from './EditSessionManager';

/**
 * EditSystem
 * Coordinates the visual helpers and selection logic during Edit Mode.
 * Refactored to delegate rendering and session concerns to smaller managers.
 */
export class EditSystem implements ISystem {
    private activeBlockId: EntityId | null = null;
    private selectedEntityId: EntityId | null = null;
    private movingEntityId: EntityId | null = null;

    private gridPlane: 'XZ' | 'XY' | 'YZ' = 'XZ';
    private hasBeenCleared: boolean = false;
    private lastClickTime: number = 0;
    private readonly DOUBLE_CLICK_DELAY = 300;

    // UI state tracking to prevent redundant updates
    private lastUISelection: EntityId | null = null;
    private lastUIPlane: string = '';
    private lastUIActiveBlock: EntityId | null = null;

    private helpers: EditHelperManager;
    private session: EditSessionManager;
    private interactHandler: (event: GameEvent) => void;

    constructor(world: World) {
        this.helpers = new EditHelperManager(world);
        this.session = new EditSessionManager(world);
        this.interactHandler = (e) => this.onInteract(world, e.payload);
        world.on("interact", this.interactHandler);
    }

    public update(world: World, dt: number): void {
        if (world.mode !== SystemMode.Edit) {
            if (!this.hasBeenCleared) {
                this.clearHelpers(world);
                this.hasBeenCleared = true;
            }
            return;
        }

        this.hasBeenCleared = false;

        // 1. Maintain Session (Active Block locking)
        this.activeBlockId = this.session.maintain(this.activeBlockId);
        world.activeEditBlockId = this.activeBlockId;

        // 2. Handle Movement
        if (this.movingEntityId !== null) {
            this.handleMovement(world);
        }

        // 3. Sync Visuals/UI
        this.helpers.sync(this.activeBlockId, this.selectedEntityId, this.gridPlane);
        this.syncUI(world);
    }

    private handleMovement(world: World) {
        if (this.movingEntityId === null || this.activeBlockId === null) return;

        const playerEntities = world.getEntitiesWith(["InputStateComponent", "TransformComponent"]);
        if (playerEntities.length === 0) return;

        const input = world.getComponent<InputStateComponent>(playerEntities[0], "InputStateComponent")!;
        const trans = world.getComponent<TransformComponent>(this.movingEntityId, "TransformComponent")!;

        let normal: [number, number, number] = [0, 1, 0];
        let planePoint: [number, number, number] = [...trans.position];

        if (this.gridPlane === 'XZ') {
            normal = [0, 1, 0];
            const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent")!;
            planePoint[1] = bComp.elevation || 0;
        } else if (this.gridPlane === 'XY') {
            normal = [0, 0, 1];
        } else if (this.gridPlane === 'YZ') {
            normal = [1, 0, 0];
        }

        const hit = world.renderEngine.intersectRayWithPlane(input.mouseNDC[0], input.mouseNDC[1], normal, planePoint);

        if (hit) {
            const playerPos = world.getComponent<TransformComponent>(playerEntities[0], "TransformComponent")!.position;
            const distSq = (hit[0] - playerPos[0]) ** 2 + (hit[1] - playerPos[1]) ** 2 + (hit[2] - playerPos[2]) ** 2;
            if (distSq > 12 * 12) return;

            const res = CONTROL_CONSTANTS.GRID_SNAP_RESOLUTION;
            const bComp = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent")!;
            const [bw, bl, bh] = world.config.world.block;
            const bWorldPos = Coords.sppToEngine([0, 0, 0], [bComp.x, bComp.y]);
            const elevation = bComp.elevation || 0;

            let newX = Coords.snapToGrid(hit[0], res);
            let newY = Coords.snapToGrid(hit[1], res);
            let newZ = Coords.snapToGrid(hit[2], res);

            newX = Math.max(bWorldPos[0], Math.min(bWorldPos[0] + bw, newX));
            newZ = Math.min(bWorldPos[2], Math.max(bWorldPos[2] - bl, newZ));
            newY = Math.max(elevation, Math.min(elevation + bh, newY));

            if (this.gridPlane === 'XZ') newY = planePoint[1];
            else if (this.gridPlane === 'XY') newZ = planePoint[2];
            else if (this.gridPlane === 'YZ') newX = planePoint[0];

            trans.position[0] = newX;
            trans.position[1] = newY;
            trans.position[2] = newZ;
        }
    }

    private onInteract(world: World, data: any) {
        if (world.mode !== SystemMode.Edit) return;

        const now = Date.now();
        const isDoubleClick = (now - this.lastClickTime) < this.DOUBLE_CLICK_DELAY;
        this.lastClickTime = now;

        if (isDoubleClick && this.selectedEntityId === data.entityId && this.selectedEntityId !== null) {
            this.cycleGridPlane(world);
            this.movingEntityId = this.movingEntityId ? null : this.selectedEntityId;
            world.isMovingObject = !!this.movingEntityId;
            return;
        }

        if (data.entityId === null) {
            this.selectedEntityId = null;
            this.movingEntityId = null;
            world.isMovingObject = false;
            this.syncUI(world);
            return;
        }

        const isBlock = world.getComponent(data.entityId, "BlockComponent") !== undefined;
        const adjunct = world.getComponent<AdjunctComponent>(data.entityId, "AdjunctComponent");

        if (isBlock) {
            if (data.entityId !== this.activeBlockId) {
                this.selectedEntityId = null;
                this.movingEntityId = null;
                world.isMovingObject = false;
                this.syncUI(world);
                return;
            }
        } else if (adjunct) {
            if (adjunct.parentBlockEntityId !== this.activeBlockId) return;
        } else {
            return;
        }

        if (this.selectedEntityId !== data.entityId) {
            this.selectedEntityId = data.entityId;
            this.movingEntityId = null;
            world.isMovingObject = false;
        } else {
            this.movingEntityId = this.movingEntityId ? null : data.entityId;
            world.isMovingObject = !!this.movingEntityId;
        }

        this.syncUI(world);
    }

    private cycleGridPlane(world: World, forcedPlane?: 'XZ' | 'XY' | 'YZ') {
        if (forcedPlane) {
            this.gridPlane = forcedPlane;
        } else {
            if (this.gridPlane === 'XZ') this.gridPlane = 'XY';
            else if (this.gridPlane === 'XY') this.gridPlane = 'YZ';
            else this.gridPlane = 'XZ';
        }
        this.syncUI(world);
    }

    private syncUI(world: World) {
        if (!world.ui) return;

        if (this.selectedEntityId === this.lastUISelection &&
            this.gridPlane === this.lastUIPlane &&
            this.activeBlockId === this.lastUIActiveBlock) {
            return;
        }

        this.lastUISelection = this.selectedEntityId;
        this.lastUIPlane = this.gridPlane;
        this.lastUIActiveBlock = this.activeBlockId;

        if (this.selectedEntityId === null) {
            world.ui.hide("edit-controls");
            return;
        }

        let position: any = 'bottom-right';
        const transform = world.getComponent<TransformComponent>(this.selectedEntityId, 'TransformComponent');
        if (transform) {
            position = world.renderEngine.worldToScreen(transform.position[0], transform.position[1] + 1.5, transform.position[2]);
        }

        const buttons: UIButtonConfig[] = [
            { label: "XZ", active: this.gridPlane === 'XZ', onClick: () => this.cycleGridPlane(world, 'XZ') },
            { label: "XY", active: this.gridPlane === 'XY', onClick: () => this.cycleGridPlane(world, 'XY') },
            { label: "YZ", active: this.gridPlane === 'YZ', onClick: () => this.cycleGridPlane(world, 'YZ') },
            {
                label: "Done", variant: 'primary', onClick: () => {
                    this.selectedEntityId = null;
                    this.movingEntityId = null;
                    world.isMovingObject = false;
                    this.syncUI(world);
                }
            }
        ];

        world.ui.showGroup("edit-controls", buttons, position);
    }

    private clearHelpers(world: World) {
        this.helpers.clearAll();
        this.session.clear();
        this.activeBlockId = null;
        world.activeEditBlockId = null;
        this.selectedEntityId = null;
        this.movingEntityId = null;
        world.isMovingObject = false;
        this.lastUISelection = null;
        this.syncUI(world);
    }
}
