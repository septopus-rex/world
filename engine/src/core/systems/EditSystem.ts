import { World, ISystem, EntityId, GameEvent } from '../World';
import { AdjunctType } from '../types/AdjunctType';
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
import { InputProvider } from './InputProvider';
import { saveBlockDraft } from '../utils/BlockSerializer';
import { PLACEABLE_ADJUNCTS, defaultRawFor } from '../edit/AdjunctDefaults';
import { getBuiltinAdjunct } from '../services/AdjunctRegistry';
import { reportError } from '../errors';

/** Placement form drops these STD keys: position/rotation are set in 3D space
 *  (click to place, [ ] to rotate, drag to move), not pre-entered in a form. */
const PLACEMENT_FILTERED_KEYS = new Set(['ox', 'oy', 'oz', 'rx', 'ry', 'rz']);

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
    /** Palette placement: the armed adjunct typeId (next click places it). */
    private placingTypeId: number | null = null;
    /** Armed module resource id (only set when placing a module / a4). */
    private placingResource: number | string | null = null;
    /** Pre-placement params (non-positional) set via the placement form; applied
     *  to the default raw when the armed type is placed. Null = use defaults. */
    private placingParams: Record<string, any> | null = null;
    /** Held-key edge tracking for the rotate/scale transform keys + undo. */
    private _prevTransformKeys: Set<string> = new Set();
    private _prevZ: boolean = false;
    private paletteDirty: boolean = false;
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
    private dirty: boolean = false;  // tracks if any edits were made this session

    // Pull-cursors over the interact channels (event-bus PR-2a).
    private primaryReader: import('../events/EventReader').EventReader<'interact.primary'>;
    private missReader: import('../events/EventReader').EventReader<'interact.miss'>;
    private contextReader: import('../events/EventReader').EventReader<'interact.context'>;

    constructor(world: World) {
        this.helpers = new EditHelperManager(world);
        this.session = new EditSessionManager(world);
        this.executor = new EditTaskExecutor();
        this.history = new EditHistory();
        this.primaryReader = world.events.reader('interact.primary');
        this.missReader = world.events.reader('interact.miss');
        this.contextReader = world.events.reader('interact.context');
    }

    public update(world: World, dt: number): void {
        if (world.mode !== SystemMode.Edit) {
            // Mode-gated: align cursors so stale clicks never replay on re-entry.
            this.primaryReader.clear();
            this.missReader.clear();
            this.contextReader.clear();
            if (!this.hasBeenCleared) {
                this.clearHelpers(world);
                this.hasBeenCleared = true;
            }
            return;
        }

        this.hasBeenCleared = false;

        // Drain this frame's clicks (same-frame: Raycast runs earlier in order).
        for (const ev of this.primaryReader.read()) {
            this.onInteract(world, { entityId: ev.target ?? null, ...(ev.payload as any) });
        }
        for (const _ev of this.missReader.read()) {
            this.onInteract(world, { entityId: null, metadata: null, distance: Infinity, point: [0, 0, 0] });
        }
        for (const ev of this.contextReader.read()) {
            this.onContextInteract(world, { entityId: ev.target ?? null, ...(ev.payload as any) });
        }

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
            this.paletteDirty = true;
        }
        if (this.paletteDirty) {
            this.renderPalette(world);
            this.paletteDirty = false;
        }

        // 2. Undo/Redo keyboard shortcuts
        this.handleUndoRedo(world);

        // 2b. Keyboard transform of the selected object (rotate / scale).
        this.handleTransformKeys(world);

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
        const sys = world.systems.findSystemByName("CharacterController") as any;
        const ip: InputProvider | null = sys?.inputProvider || null;
        if (!ip) return;

        const ctrlHeld = ip.isKeyPressed('ControlLeft') || ip.isKeyPressed('ControlRight') ||
            ip.isKeyPressed('MetaLeft') || ip.isKeyPressed('MetaRight');
        const shiftHeld = ip.isKeyPressed('ShiftLeft') || ip.isKeyPressed('ShiftRight');

        // Edge-detect KeyZ off the held-key set: isKeyJustPressed is already
        // cleared by CharacterController's flushDeltas before EditSystem runs
        // (this is why Ctrl+Z previously never fired).
        const zDown = ip.isKeyPressed('KeyZ');
        const zJustPressed = zDown && !this._prevZ;
        this._prevZ = zDown;

        if (ctrlHeld && shiftHeld && zJustPressed) {
            this.redo(world);
        } else if (ctrlHeld && zJustPressed) {
            this.undo(world);
        }
    }

    /**
     * Keyboard transform of the selected adjunct (the rotate/scale "gizmo"):
     *   [ / ]   yaw -15° / +15°
     *   - / =   uniform scale ×0.9 / ×1.1
     * Each nudge is a 'set' task — undoable + persisted like any edit. Plane-drag
     * already handles translation (handleMovement); a visual drag-handle gizmo is
     * a separate render feature.
     */
    private handleTransformKeys(world: World): void {
        const ip = (world.systems.findSystemByName("CharacterController") as any)?.inputProvider as InputProvider | null;
        if (!ip) return;

        // Edge-detect against the HELD-key set: CharacterController (which runs
        // before EditSystem) calls flushDeltas() and clears justPressedKeys, so
        // isKeyJustPressed is already empty here. The held `keys` survive, so we
        // track our own previous state to fire once per press.
        const CODES = ['BracketRight', 'BracketLeft', 'Equal', 'Minus'];
        let pressed: string | null = null;
        for (const c of CODES) {
            if (ip.isKeyPressed(c) && !this._prevTransformKeys.has(c)) { pressed = c; break; }
        }
        this._prevTransformKeys = new Set(CODES.filter(c => ip.isKeyPressed(c)));

        if (pressed === null || this.selectedEntityId === null || this.movingEntityId !== null) return;
        const adj = world.getComponent<AdjunctComponent>(this.selectedEntityId, "AdjunctComponent");
        if (!adj) return;
        const std = adj.stdData as any;

        const ROT = Math.PI / 12; // 15°
        const r2 = (n: number) => Math.round(n * 1000) / 1000;
        let param: Record<string, any> | null = null;

        if (pressed === 'BracketRight') param = { ry: r2((std.ry ?? 0) + ROT) };
        else if (pressed === 'BracketLeft') param = { ry: r2((std.ry ?? 0) - ROT) };
        else if (pressed === 'Equal' && typeof std.x === 'number')
            param = { x: r2(std.x * 1.1), y: r2(std.y * 1.1), z: r2(std.z * 1.1) };
        else if (pressed === 'Minus' && typeof std.x === 'number')
            param = { x: r2(std.x / 1.1), y: r2(std.y / 1.1), z: r2(std.z / 1.1) };

        if (!param) return;
        const task: EditTask = { entityId: this.selectedEntityId, adjunct: '', action: 'set', param };
        const result = this.executor.execute(world, task);
        if (result.success && result.snapshot) {
            this.history.push({ task, snapshot: result.snapshot });
            this.dirty = true;
            this.lastUISelection = null;
            this.syncUI(world);
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

        // Palette placement: an armed type turns the next click into "place here".
        if (this.placingTypeId !== null && data.entityId !== null && data.point) {
            this.placeAt(world, data.point);
            return;
        }

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

    /** Render the placement palette (one button per placeable adjunct type). */
    private renderPalette(world: World): void {
        if (!world.ui || this.activeBlockId === null) return;
        const buttons: UIButtonConfig[] = PLACEABLE_ADJUNCTS.map(entry => ({
            label: entry.label,
            active: this.placingTypeId === entry.typeId && this.placingResource === null,
            onClick: () => {
                const same = this.placingTypeId === entry.typeId && this.placingResource === null;
                this.placingTypeId = same ? null : entry.typeId;
                this.placingResource = null;
                this.placingParams = null;       // re-arm resets any prior tweaks
                this.paletteDirty = true;
                if (this.placingTypeId !== null) {
                    this.showPlacementForm(world, entry.typeId, entry.label);
                    world.ui?.showToast(`Place ${entry.label}: tweak params (optional), then click a surface`);
                } else {
                    world.ui?.hide("place-form");
                }
            },
        }));

        // Module (a4) needs a resource — append one button per registered model
        // (world.moduleCatalog, pushed by the client). Picking one arms the module
        // type with that resource id.
        for (const model of world.moduleCatalog) {
            buttons.push({
                label: `▣ ${model.label}`,
                active: this.placingTypeId === AdjunctType.Module && this.placingResource === model.id,
                onClick: () => {
                    const same = this.placingTypeId === AdjunctType.Module && this.placingResource === model.id;
                    this.placingTypeId = same ? null : AdjunctType.Module;
                    this.placingResource = same ? null : model.id;
                    this.placingParams = null;
                    this.paletteDirty = true;
                    // Modules carry only a resource (already chosen here) — no pre-form.
                    world.ui?.hide("place-form");
                    if (this.placingTypeId !== null) {
                        world.ui?.showToast(`Place ${model.label}: click a surface in the active block`);
                    }
                },
            });
        }
        world.ui.showGroup("edit-palette", buttons, 'mid-left');
    }

    /**
     * Pre-placement params: when a type is armed, show its edit form pre-filled
     * with the placement defaults, MINUS position/rotation (those are set in 3D
     * space — click to place, [ ] to rotate, drag to move). Submitting captures
     * the tweaks into placingParams; they're applied to the default raw when the
     * surface is clicked. No editable non-positional fields ⇒ no form (just arm).
     */
    private showPlacementForm(world: World, typeId: number, label: string): void {
        if (!world.ui) return;
        const def = getBuiltinAdjunct(typeId);
        if (!def?.menu?.form || !def.attribute?.deserialize) { world.ui.hide("place-form"); return; }

        // Default STD (dummy position — filtered out anyway) to seed the form.
        const std = def.attribute.deserialize(defaultRawFor(typeId, [8, 8, 0]) ?? []);
        const groups = def.menu.form(std)
            .map(g => ({ ...g, fields: g.fields.filter((f: any) => !PLACEMENT_FILTERED_KEYS.has(f.key)) }))
            .filter(g => g.fields.length > 0);
        if (groups.length === 0) { world.ui.hide("place-form"); return; } // nothing tweakable

        world.ui.showForm("place-form", {
            title: `New ${label} — set params, then click a surface`,
            groups,
            modal: false, // non-blocking: the canvas must stay clickable to place
            onSubmit: (values) => {
                this.placingParams = values;
                world.ui?.showToast(`${label} params set · click a surface to place`);
            },
            onClose: () => { /* keep armed; placement uses last-submitted params */ },
        });
    }

    /** Apply submitted form values onto an STD object (handles dotted keys like
     *  "material.resource"); never touches position/rotation (those win from the
     *  clicked point / defaults). */
    private applyValuesToStd(std: any, values: Record<string, any>): void {
        for (const key in values) {
            if (PLACEMENT_FILTERED_KEYS.has(key)) continue;
            if (key.includes('.')) {
                const parts = key.split('.');
                let t = std;
                for (let i = 0; i < parts.length - 1; i++) { if (!t[parts[i]]) t[parts[i]] = {}; t = t[parts[i]]; }
                t[parts[parts.length - 1]] = values[key];
            } else {
                std[key] = values[key];
            }
        }
    }

    /** Place the armed palette type at a clicked surface point (engine coords). */
    private placeAt(world: World, point: [number, number, number]): void {
        const typeId = this.placingTypeId;
        if (typeId === null || this.activeBlockId === null) return;
        const block = world.getComponent<BlockComponent>(this.activeBlockId, "BlockComponent");
        if (!block) return;

        const spp = Coords.engineToSpp([point[0], point[1], point[2]]);
        if (spp.block[0] !== block.x || spp.block[1] !== block.y) {
            world.ui?.showToast('Placement must stay inside the active edit block');
            return; // keep the type armed — let the creator click again
        }
        spp.pos[2] -= block.elevation || 0;   // raw altitudes are block-relative

        let raw = defaultRawFor(typeId, spp.pos, { resource: this.placingResource ?? undefined });
        if (!raw) { world.ui?.showToast('No placement defaults for this type'); return; }

        // Overlay any pre-placement param tweaks onto the default raw (size/color/
        // url/intensity/…); position & rotation always come from the click/defaults.
        if (this.placingParams) {
            const def = getBuiltinAdjunct(typeId);
            if (def?.attribute?.deserialize && def?.attribute?.serialize) {
                try {
                    const std = def.attribute.deserialize(raw);
                    this.applyValuesToStd(std, this.placingParams);
                    raw = def.attribute.serialize(std);
                } catch (e) { reportError(e, { tag: '[EditSystem]', severity: 'warn', id: 'pre-placement params; using defaults' }); }
            }
        }

        // block.max (the lord's per-block cap): refuse at the AUTHORING boundary,
        // not just at inject — otherwise the editor lets you place content that a
        // reload would silently truncate away (data loss). Counts authored rows
        // only (ground plate + SPP/motif expansion products are derived).
        const cap = (world.config as any)?.block?.max;
        if (typeof cap === 'number' && cap > 0 && this.activeBlockId !== null) {
            let authored = 0;
            for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
                const a = world.getComponent<any>(eid, 'AdjunctComponent');
                if (!a || a.parentBlockEntityId !== this.activeBlockId) continue;
                if (typeof a.adjunctId === 'string' && a.adjunctId.startsWith('ground')) continue;
                if (a.stdData?.derivedFrom) continue;
                authored++;
            }
            if (authored >= cap) {
                world.ui?.showToast(`Block is full (${cap} adjunct limit)`);
                return;
            }
        }

        const task: EditTask = {
            entityId: -1,
            adjunct: '',
            action: 'add',
            param: { typeId, blockEntityId: this.activeBlockId, raw },
        };
        const result = this.executor.execute(world, task);
        if (!result.success || !result.snapshot) {
            world.ui?.showToast('Placement failed');
            return;
        }

        this.history.push({ task, snapshot: result.snapshot }); // undo = delete it
        this.dirty = true;
        this.placingTypeId = null;
        this.placingResource = null;
        this.placingParams = null;
        this.paletteDirty = true;
        world.ui?.hide("place-form");
        this.selectedEntityId = task.entityId;
        this.lastUISelection = null;
        this.syncUI(world);
        world.ui?.showToast('Placed — double-click to move, right-click to edit');
    }

    private clearHelpers(world: World) {
        // Save draft to localStorage before clearing
        if (this.dirty && this.activeBlockId !== null) {
            this.saveDraft(world, this.activeBlockId);
        }
        this.placingTypeId = null;
        world.ui?.hide("edit-palette");

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
     * Serialize the active block's adjuncts back to raw format and persist as a
     * draft (shared path with ItemSystem's atomic pickup/drop — BlockSerializer).
     */
    private saveDraft(world: World, blockEntityId: EntityId): void {
        saveBlockDraft(world, blockEntityId);
    }

    private showUploadButtonIfNeeded(world: World): void {
        const drafts = world.draftStore.list(0);
        if (drafts.length > 0 && world.ui) {
            world.ui.showButton("upload-drafts", {
                label: `⬆️ Upload (${drafts.length})`,
                variant: 'primary',
                onClick: () => {
                    world.events.emit("edit.upload_request", { drafts });
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
