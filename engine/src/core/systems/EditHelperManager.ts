import { World, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { MeshComponent } from '../components/VisualizationComponents';
import { RenderHandle } from '../types/Adjunct';
import { Coords } from '../utils/Coords';

/**
 * Manages Three.js-based visual helpers for Edit Mode.
 */
export class EditHelperManager {
    private blockHelper: RenderHandle | null = null;
    private gridHelper: RenderHandle | null = null;
    private selectionHighlight: RenderHandle | null = null;

    constructor(private world: World) { }

    public sync(activeBlockId: EntityId | null, selectedEntityId: EntityId | null, gridPlane: string) {
        // 1. Block Highlight
        if (activeBlockId !== null && !this.blockHelper) {
            const meshComp = this.world.getComponent<MeshComponent>(activeBlockId, "MeshComponent");
            if (meshComp?.handle) {
                const [bw, bl, bh] = this.world.config.world.block;
                this.blockHelper = this.world.renderEngine.createBlockHighlight(meshComp.handle, bw, bl, bh);
            }
        }

        // 2. Selection Highlight
        if (selectedEntityId !== null) {
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
        }

        // 3. Grid Helper
        if (activeBlockId !== null) {
            this.updateGrid(activeBlockId, selectedEntityId, gridPlane);
        } else {
            this.clearGrid();
        }
    }

    private updateGrid(activeBlockId: EntityId, selectedEntityId: EntityId | null, gridPlane: string) {
        const [bw, bl, bh] = this.world.config.world.block;
        if (!this.gridHelper) {
            this.gridHelper = this.world.renderEngine.createGridHelper(bw, 8, 0x00ffff, 0x008888);
        }

        const bComp = this.world.getComponent<BlockComponent>(activeBlockId, "BlockComponent")!;
        const bWorldPos = Coords.sppToEngine([0, 0, 0], [bComp.x, bComp.y]);
        const elevation = bComp.elevation || 0;
        const offset = 0.01;

        let depthY = elevation, depthZ = bWorldPos[2], depthX = bWorldPos[0];

        if (selectedEntityId !== null) {
            const trans = this.world.getComponent<TransformComponent>(selectedEntityId, "TransformComponent");
            if (trans) {
                depthY = trans.position[1];
                depthZ = trans.position[2];
                depthX = trans.position[0];
            }
        }

        if (gridPlane === 'XZ') {
            this.world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, depthY + offset, bWorldPos[2] - bl / 2);
            (this.gridHelper as any).rotation.set(0, 0, 0);
        } else if (gridPlane === 'XY') {
            this.world.renderEngine.setObjectPosition(this.gridHelper, bWorldPos[0] + bw / 2, elevation + bh / 2, depthZ + offset);
            (this.gridHelper as any).rotation.set(Math.PI / 2, 0, 0);
        } else {
            this.world.renderEngine.setObjectPosition(this.gridHelper, depthX + offset, elevation + bh / 2, bWorldPos[2] - bl / 2);
            (this.gridHelper as any).rotation.set(0, 0, Math.PI / 2);
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
        this.blockHelper = null;
    }
}
