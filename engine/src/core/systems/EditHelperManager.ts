import { World, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { RenderHandle } from '../types/Adjunct';
import { Coords } from '../utils/Coords';
import type { GizmoHooks } from '../../render/TransformGizmo';

/**
 * The edit grid's reference plane, driven by the gizmo handle under the
 * pointer: horizontal moves read against the ground plane, but a VERTICAL
 * drag (Y arrow) needs an upright grid to read the height step against —
 * pick whichever upright plane faces the camera more (|cos ψ| vs |sin ψ|
 * of the camera yaw). Plane handles map to their own plane; released/idle
 * falls back to the ground plane.
 */
export function gridPlaneForAxis(axis: string | null, camYaw: number): 'XZ' | 'XY' | 'YZ' {
    if (axis === 'XY' || axis === 'YZ') return axis;
    if (axis === 'Y') {
        return Math.abs(Math.cos(camYaw)) >= Math.abs(Math.sin(camYaw)) ? 'XY' : 'YZ';
    }
    return 'XZ'; // null / X / Z / XZ / XYZ
}

/**
 * Manages Three.js-based visual helpers for Edit Mode.
 */
export class EditHelperManager {
    private blockHelper: RenderHandle | null = null;
    private gridHelper: RenderHandle | null = null;
    private selectionHighlight: RenderHandle | null = null;
    private lastSelectedEntityId: EntityId | null = null;
    private lastGizmoTarget: RenderHandle | null = null;

    constructor(private world: World) { }

    public sync(activeBlockId: EntityId | null, selectedEntityId: EntityId | null, gizmoHooks: GizmoHooks) {
        // 1. Block Highlight
        if (activeBlockId !== null && !this.blockHelper) {
            const meshComp = this.world.getComponent<MeshComponent>(activeBlockId, "MeshComponent");
            if (meshComp?.handle) {
                const [bw, bl, bh] = this.world.config.world.block;
                this.blockHelper = this.world.renderEngine.createBlockHighlight(meshComp.handle, bw, bl, bh);
            }
        }

        // 2. Selection Highlight — recreate when selected entity changes.
        // Derived pieces highlight AMBER (not editable — no gizmo, see below);
        // authored content keeps the edit-accent cyan.
        const selAdj = selectedEntityId !== null
            ? this.world.getComponent<AdjunctComponent>(selectedEntityId, "AdjunctComponent") : undefined;
        const isDerived = !!selAdj?.stdData?.derivedFrom;
        if (selectedEntityId !== null) {
            // If the selection target changed, destroy the old highlight so we rebuild from the new geometry
            if (selectedEntityId !== this.lastSelectedEntityId) {
                this.clearSelectionHighlight();
                this.lastSelectedEntityId = selectedEntityId;
            }

            const trans = this.world.getComponent<TransformComponent>(selectedEntityId, "TransformComponent");
            const group = this.world.renderEngine.getObjectByEntityId(selectedEntityId);
            if (trans) {
                if (!this.selectionHighlight && group) {
                    this.selectionHighlight = this.world.renderEngine.createSelectionHighlight(group, isDerived ? 0xffa500 : 0x00ffff);
                }
                if (this.selectionHighlight) {
                    this.world.renderEngine.setObjectPosition(this.selectionHighlight, trans.position[0], trans.position[1], trans.position[2]);
                }
            }
        } else {
            this.clearSelectionHighlight();
            this.lastSelectedEntityId = null;
        }

        // 3. Translate gizmo (XYZ drag arrows) — authored adjuncts only: derived
        // pieces (SPP/motif expansion) never persist a move (BlockSerializer keeps
        // just the source row), so offering the gizmo there would be a lie. The
        // target is compared by HANDLE, not entity: an edit 'set' rebuilds the
        // mesh group, and the gizmo must hop onto the new one.
        let gizmoTarget: RenderHandle | null = null;
        if (selAdj && !isDerived) {
            gizmoTarget = this.world.renderEngine.getObjectByEntityId(selectedEntityId!);
        }
        if (gizmoTarget) {
            if (gizmoTarget !== this.lastGizmoTarget) {
                this.world.renderEngine.attachTransformGizmo(gizmoTarget, gizmoHooks);
                this.lastGizmoTarget = gizmoTarget;
            }
        } else if (this.lastGizmoTarget) {
            this.world.renderEngine.detachTransformGizmo();
            this.lastGizmoTarget = null;
        }

        // 4. Grid Helper — ground-plane (XZ) reference at the selection's height.
        if (activeBlockId !== null) {
            this.updateGrid(activeBlockId, selectedEntityId);
        } else {
            this.clearGrid();
        }
    }

    private updateGrid(activeBlockId: EntityId, selectedEntityId: EntityId | null) {
        const [bw, bl, bh] = this.world.config.world.block;
        if (!this.gridHelper) {
            this.gridHelper = this.world.renderEngine.createGridHelper(bw, 8, 0x00ffff, 0x008888);
        }

        const bComp = this.world.getComponent<BlockComponent>(activeBlockId, "BlockComponent")!;
        const bWorldPos = Coords.septopusToEngine([0, 0, 0], [bComp.x, bComp.y]);
        const elevation = bComp.elevation || 0;
        const offset = 0.01;

        // The plane passes THROUGH the selection so the object reads directly
        // against the grid lines.
        let depthX = bWorldPos[0], depthY = elevation, depthZ = bWorldPos[2];
        if (selectedEntityId !== null) {
            const trans = this.world.getComponent<TransformComponent>(selectedEntityId, "TransformComponent");
            if (trans) {
                depthX = trans.position[0];
                depthY = trans.position[1];
                depthZ = trans.position[2];
            }
        }

        const plane = gridPlaneForAxis(
            this.world.renderEngine.gizmoAxis(),
            this.world.renderEngine.getMainCameraRotation()[1],
        );
        if (plane === 'XZ') {
            this.world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, depthY + offset, bWorldPos[2] - bl / 2);
            this.world.renderEngine.setObjectRotation(this.gridHelper, 0, 0, 0);
        } else if (plane === 'XY') {
            // Upright, east-west × vertical (normal = engine Z)
            this.world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, elevation + bh / 2, depthZ + offset);
            this.world.renderEngine.setObjectRotation(this.gridHelper, Math.PI / 2, 0, 0);
        } else {
            // Upright, north-south × vertical (normal = engine X)
            this.world.renderEngine.setObjectPosition(this.gridHelper, depthX + offset, elevation + bh / 2, bWorldPos[2] - bl / 2);
            this.world.renderEngine.setObjectRotation(this.gridHelper, 0, 0, Math.PI / 2);
        }
    }

    private clearSelectionHighlight() {
        if (this.selectionHighlight) {
            this.world.renderEngine.removeHandle(this.selectionHighlight);
            this.selectionHighlight = null;
        }
    }

    private clearGrid() {
        if (this.gridHelper) {
            this.world.renderEngine.removeHandle(this.gridHelper);
            this.gridHelper = null;
        }
    }

    public clearAll() {
        if (this.blockHelper) this.world.renderEngine.removeHandle(this.blockHelper);
        this.clearSelectionHighlight();
        this.clearGrid();
        if (this.lastGizmoTarget) {
            this.world.renderEngine.detachTransformGizmo();
            this.lastGizmoTarget = null;
        }
        this.blockHelper = null;
    }
}
