import { World } from '../World';
import { RenderHandle, AdjunctDefinition } from '../types/Adjunct';
import { Coords } from '../utils/Coords';
import { MeshFactory } from '../../render/MeshFactory';
import { Color } from '../utils/Math';
import { BlockComponent } from '../components/BlockComponent';
import { MeshComponent } from '../components/VisualizationComponents';

export interface IAdjunctCreationResult {
    handle: RenderHandle;
    triggerVolumes: any[];
}

/**
 * AdjunctFactory handles the assembly of 3D representations for Adjuncts.
 */
export class AdjunctFactory {
    /**
     * Creates a fully assembled 3D mesh for an adjunct.
     */
    public static createMesh(world: World, blockEid: any, std: any, logic: any): IAdjunctCreationResult {
        const block = world.getComponent<BlockComponent>(blockEid, "BlockComponent");
        const meshComp = world.getComponent<MeshComponent>(blockEid, "MeshComponent");
        const triggerVolumes: any[] = [];

        // 1. Create a group to hold all parts of the adjunct
        const meshGroup = world.renderEngine.createGroup(meshComp?.handle);

        // 2. Set relative position in the group (Spatial logic remains consistent)
        // Note: The factory only creates the mesh, VisualSyncSystem will update its world pose.
        // But for multi-part objects, we need to position parts relative to the meshGroup.
        const localPos = Coords.localSppToEngine([std.ox, std.oy, std.oz]);

        let renderDataList: any[] = [];
        try {
            if (typeof logic.transform?.stdToRenderData === 'function') {
                renderDataList = logic.transform.stdToRenderData([std], 0);
            } else if (typeof logic.transform?.std_3d === 'function') {
                renderDataList = logic.transform.std_3d([std], 0);
            }

            for (const renderItem of renderDataList) {
                if (renderItem.triggerVolume) {
                    triggerVolumes.push(renderItem.triggerVolume);
                }

                if (renderItem.hidden) continue;

                let mesh: RenderHandle;
                if (typeof logic.transform?.createMesh === 'function') {
                    mesh = logic.transform.createMesh(renderItem);
                } else {
                    // Apply legacy material hashing for certain box adjuncts
                    this.applyMaterialHashing(world, block, std, renderItem);
                    mesh = MeshFactory.create(renderItem);
                }

                // Position sub-mesh relative to the meshGroup
                const subEnginePos = Coords.localSppToEngine(renderItem.params.position);
                const relativePos = [
                    subEnginePos[0] - localPos[0],
                    subEnginePos[1] - localPos[1],
                    subEnginePos[2] - localPos[2]
                ];

                world.renderEngine.setObjectPosition(mesh, relativePos[0], relativePos[1], relativePos[2]);
                world.renderEngine.setObjectRotation(mesh,
                    renderItem.params.rotation[0] || 0,
                    renderItem.params.rotation[1] || 0,
                    renderItem.params.rotation[2] || 0
                );

                world.renderEngine.addObjectToGroup(meshGroup, mesh);
            }
        } catch (error) {
            console.error(`[AdjunctFactory] Failed to assemble mesh for adjunct.`, error);
        }

        return { handle: meshGroup, triggerVolumes };
    }

    private static applyMaterialHashing(world: World, block: any, std: any, renderItem: any) {
        if (renderItem.type === 'box' && renderItem.params.position[2] < 0 && !renderItem.material?.color) {
            let bx = block?.x || 0;
            let by = block?.y || 0;
            const hash = (bx * 71 + by * 131);
            const h = ((hash % 100) + 100) % 100 / 100;
            renderItem.material = {
                ...renderItem.material,
                color: new Color().setHSL(h, 0.5, 0.4).getHex()
            };
        }
    }
}
