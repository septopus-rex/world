import { World, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { RenderHandle } from '../types/Adjunct';
import { Coords } from '../utils/Coords';
import type { GizmoHooks } from '../../render/TransformGizmo';

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

        // 2. Selection Highlight — recreate when selected entity changes
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
                    this.selectionHighlight = this.world.renderEngine.createSelectionHighlight(group, 0x00ffff);
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
        if (selectedEntityId !== null) {
            const adj = this.world.getComponent<AdjunctComponent>(selectedEntityId, "AdjunctComponent");
            if (adj && !adj.stdData?.derivedFrom) {
                gizmoTarget = this.world.renderEngine.getObjectByEntityId(selectedEntityId);
            }
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
        const [bw, bl] = this.world.config.world.block;
        if (!this.gridHelper) {
            this.gridHelper = this.world.renderEngine.createGridHelper(bw, 8, 0x00ffff, 0x008888);
        }

        const bComp = this.world.getComponent<BlockComponent>(activeBlockId, "BlockComponent")!;
        const bWorldPos = Coords.septopusToEngine([0, 0, 0], [bComp.x, bComp.y]);
        const elevation = bComp.elevation || 0;
        const offset = 0.01;

        let depthY = elevation;
        if (selectedEntityId !== null) {
            const trans = this.world.getComponent<TransformComponent>(selectedEntityId, "TransformComponent");
            if (trans) depthY = trans.position[1];
        }

        this.world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, depthY + offset, bWorldPos[2] - bl / 2);
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
