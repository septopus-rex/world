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
import { EditTaskExecutor } from '../EditTaskExecutor';
import { EditTask, ContextMenuItem } from '../types/EditTask';
import { EditHistory } from '../EditHistory';
import { DraftStorage } from '../services/DraftStorage';
import { InputProvider } from './InputProvider';

/**
 * EditSystem
 * Coordinates editing lifecycle: selection, movement, undo/redo, draft persistence.
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
    private executor: EditTaskExecutor;
    private history: EditHistory;
    private draftStorage: DraftStorage;
    private interactHandler: (event: GameEvent) => void;
    private contextHandler: (event: GameEvent) => void;
    private dirty: boolean = false;  // tracks if any edits were made this session

    constructor(world: World) {
        this.helpers = new EditHelperManager(world);
        this.session = new EditSessionManager(world);
        this.executor = new EditTaskExecutor();
        this.history = new EditHistory();
        this.draftStorage = new DraftStorage();
        this.interactHandler = (e) => this.onInteract(world, e.payload);
        this.contextHandler = (e) => this.onContextInteract(world, e.payload);
        world.on("interact", this.interactHandler);
        world.on("context-interact", this.contextHandler);
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
        const prevBlockId = this.activeBlockId;
        this.activeBlockId = this.session.maintain(this.activeBlockId);
        world.activeEditBlockId = this.activeBlockId;

        // Start new history session if block changed
        if (this.activeBlockId !== prevBlockId && this.activeBlockId !== null) {
            const block = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent");
            if (block) {
                this.history.startSession(`${block.x}_${block.y}`);
                this.dirty = false;
            }
        }

        // 2. Undo/Redo keyboard shortcuts
        this.handleUndoRedo(world);

        // 3. Handle Movement
        if (this.movingEntityId !== null) {
            this.handleMovement(world);
        }

        // 4. Sync Visuals/UI
        this.helpers.sync(this.activeBlockId, this.selectedEntityId, this.gridPlane);
        this.syncUI(world);
    }

    private handleUndoRedo(world: World): void {
        // Read from InputProvider for Ctrl+Z / Ctrl+Shift+Z
        const players = world.getEntitiesWith(["InputStateComponent"]);
        if (players.length === 0) return;
        const input = world.getComponent<InputStateComponent>(players[0], "InputStateComponent");
        if (!input) return;

        // Ctrl+Z = undo, Ctrl+Shift+Z = redo
        // We use the world's inputProvider via the system manager
        const sys = world.systems.findSystemByName("PlayerIntentSystem") as any;
        const ip: InputProvider | null = sys?.inputProvider || null;
        if (!ip) return;

        const ctrlHeld = ip.isKeyPressed('ControlLeft') || ip.isKeyPressed('ControlRight') ||
            ip.isKeyPressed('MetaLeft') || ip.isKeyPressed('MetaRight');
        const shiftHeld = ip.isKeyPressed('ShiftLeft') || ip.isKeyPressed('ShiftRight');

        if (ctrlHeld && shiftHeld && ip.isKeyJustPressed('KeyZ')) {
            this.redo(world);
        } else if (ctrlHeld && ip.isKeyJustPressed('KeyZ')) {
            this.undo(world);
        }
    }

    private undo(world: World): void {
        const entry = this.history.popUndo();
        if (!entry) return;
        this.executor.restore(world, entry.task.entityId, entry.snapshot);
        world.ui?.showToast(`Undo (${this.history.undoCount} remaining)`);
        this.lastUISelection = null;
        this.syncUI(world);
    }

    private redo(world: World): void {
        const entry = this.history.popRedo();
        if (!entry) return;
        // Re-execute the task
        this.executor.execute(world, entry.task);
        world.ui?.showToast(`Redo (${this.history.redoCount} remaining)`);
        this.lastUISelection = null;
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
            trans.dirty = true;
        }
    }

    private onInteract(world: World, data: any) {
        if (world.mode !== SystemMode.Edit) return;

        // Dismiss any open context menu or form on any left-click
        world.ui?.hide("context-menu");
        world.ui?.hide("edit-form");

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
        // Save draft to localStorage before clearing
        if (this.dirty && this.activeBlockId !== null) {
            this.saveDraft(world, this.activeBlockId);
        }

        this.helpers.clearAll();
        this.session.clear();
        this.history.clear();
        this.activeBlockId = null;
        world.activeEditBlockId = null;
        this.selectedEntityId = null;
        this.movingEntityId = null;
        world.isMovingObject = false;
        this.dirty = false;
        this.lastUISelection = null;
        world.ui?.hide("context-menu");
        world.ui?.hide("edit-form");
        world.ui?.hide("edit-controls");

        // Check if any drafts exist — show upload button
        this.showUploadButtonIfNeeded(world);
    }

    /**
     * Serialize the active block's adjuncts back to raw format and save to localStorage.
     */
    private saveDraft(world: World, blockEntityId: EntityId): void {
        const block = world.getComponent<BlockComponent>(blockEntityId, "BlockComponent");
        if (!block) return;

        const worldId = typeof block.world === 'number' ? block.world : 0;
        const adjunctEntities = world.getEntitiesWith(["AdjunctComponent"]);

        // Group adjuncts by typeId
        const grouped = new Map<number, any[]>();

        for (const eid of adjunctEntities) {
            const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (!adj || adj.parentBlockEntityId !== blockEntityId) continue;

            const typeId = adj.stdData.typeId ?? 0x00a2;
            const logic = adj.logicModule;
            if (!logic?.attribute?.serialize) continue;

            const rawInst = logic.attribute.serialize(adj.stdData);
            if (!grouped.has(typeId)) grouped.set(typeId, []);
            grouped.get(typeId)!.push(rawInst);
        }

        // Rebuild raw format: [elevation, status, adjunctsRaw, animations]
        const adjunctsRaw: any[] = [];
        grouped.forEach((instances, typeId) => {
            adjunctsRaw.push([typeId, instances]);
        });

        const raw = [
            block.elevation || 0,
            1,  // status: active
            adjunctsRaw,
            block.animations || []
        ];

        this.draftStorage.save(worldId, block.x, block.y, raw);
        block.isDraft = true;
        world.emitSimple("world:draft_saved", { blockKey: `${block.x}_${block.y}` });
    }

    private showUploadButtonIfNeeded(world: World): void {
        const drafts = this.draftStorage.list(0);
        if (drafts.length > 0 && world.ui) {
            world.ui.showButton("upload-drafts", {
                label: `⬆️ Upload (${drafts.length})`,
                variant: 'primary',
                onClick: () => {
                    world.emitSimple("world:upload_request", { drafts });
                    world.ui?.showToast("Upload requested — awaiting chain connection.");
                    world.ui?.hide("upload-drafts");
                }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Context Menu (Right-Click) Flow
    // ─────────────────────────────────────────────────────────────

    private onContextInteract(world: World, data: any) {
        if (world.mode !== SystemMode.Edit) return;
        if (!data.entityId) return;

        // Only allow context menu on adjuncts belonging to active block
        const adjComp = world.getComponent<AdjunctComponent>(data.entityId, "AdjunctComponent");
        if (!adjComp || adjComp.parentBlockEntityId !== this.activeBlockId) return;

        // Select the entity for visual feedback
        this.selectedEntityId = data.entityId;
        this.movingEntityId = null;
        world.isMovingObject = false;

        // Get menu items from the adjunct's plugin
        const menuDef = adjComp.logicModule?.menu;
        const items: ContextMenuItem[] = menuDef?.contextMenu
            ? menuDef.contextMenu(adjComp.stdData)
            : [{ label: "✏️ Edit", action: "edit" }]; // Fallback

        this.showContextMenu(world, data.entityId, adjComp, items, data.screenPos);
    }

    private showContextMenu(world: World, entityId: EntityId, adjComp: AdjunctComponent, items: ContextMenuItem[], screenNDC: [number, number]) {
        if (!world.ui) return;

        // Convert NDC → 0-1 screen space for showGroup
        const screenPos = {
            x: (screenNDC[0] + 1) / 2,
            y: (1 - screenNDC[1]) / 2
        };

        const buttons: UIButtonConfig[] = items.map(item => ({
            label: item.label,
            variant: item.variant,
            onClick: () => {
                world.ui!.hide("context-menu");
                this.handleContextAction(world, entityId, adjComp, item.action);
            }
        }));

        world.ui.showGroup("context-menu", buttons, screenPos);
    }

    private handleContextAction(world: World, entityId: EntityId, adjComp: AdjunctComponent, action: string) {
        switch (action) {
            case 'edit':
                this.showEditForm(world, entityId, adjComp);
                break;
            case 'delete': {
                const task: EditTask = {
                    entityId,
                    adjunct: adjComp.adjunctId,
                    action: 'delete',
                    param: {}
                };
                const result = this.executor.execute(world, task);
                if (result.success && result.snapshot) {
                    this.history.push({ task, snapshot: result.snapshot });
                    this.dirty = true;
                }
                this.selectedEntityId = null;
                this.syncUI(world);
                break;
            }
            default:
                console.warn(`[EditSystem] Unknown context action: ${action}`);
        }
    }

    private showEditForm(world: World, entityId: EntityId, adjComp: AdjunctComponent) {
        if (!world.ui) return;

        const menuDef = adjComp.logicModule?.menu;
        if (!menuDef?.form) {
            world.ui.showToast("No editable properties for this object.");
            return;
        }

        const groups = menuDef.form(adjComp.stdData);

        world.ui.showForm("edit-form", {
            title: `Edit ${adjComp.adjunctId} #${adjComp.stdData.index ?? 0}`,
            groups: groups,
            onSubmit: (values) => {
                // Flatten dotted keys (e.g. "material.resource" → nested update)
                const param = this.flattenFormValues(values, adjComp.stdData);

                const task: EditTask = {
                    entityId,
                    adjunct: adjComp.adjunctId,
                    action: 'set',
                    param
                };

                const result = this.executor.execute(world, task);
                if (result.success) {
                    if (result.snapshot) {
                        this.history.push({ task, snapshot: result.snapshot });
                    }
                    this.dirty = true;
                    world.ui?.showToast(`Updated ${adjComp.adjunctId}`);
                    // Force UI refresh
                    this.lastUISelection = null;
                    this.syncUI(world);
                }
            },
            onClose: () => {
                // no-op
            }
        });
    }

    /**
     * Convert form values to a flat param object compatible with EditTask.
     * Handles dotted keys like "material.resource" by setting the nested value on stdData.
     */
    private flattenFormValues(values: Record<string, any>, std: any): Record<string, any> {
        const param: Record<string, any> = {};

        for (const key in values) {
            if (key.includes('.')) {
                // Nested key: "material.resource" → set std.material.resource
                const parts = key.split('.');
                let target = std;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = values[key];
                // Also store the top-level container so executor merges correctly
                param[parts[0]] = std[parts[0]];
            } else {
                param[key] = values[key];
            }
        }

        return param;
    }
}
