import { World, ISystem, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { Coords } from '../utils/Coords';
import { RenderHandle } from '../types/Adjunct';
import { Color } from '../utils/Math';
import { MeshComponent } from '../components/VisualizationComponents';
import { AdjunctFactory } from '../factories/AdjunctFactory';
import { BlockComponent } from '../components/BlockComponent';

export interface IAdjunctLogic {
    transform: {
        stdToRenderData?: (stds: any[], va: number) => any[];
        std_3d?: (stds: any[], va: number) => any[];
        createMesh?: (data: any) => RenderHandle;
    };
    menu?: {
        sidebar?: (params: any) => any;
    };
}

export class AdjunctSystem implements ISystem {
    private initializedAdjuncts: Set<EntityId> = new Set();

    public update(world: World, deltaTime: number): void {
        const adjunctEntities = world.queryEntities("AdjunctComponent");

        for (const entityId of adjunctEntities) {
            const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
            if (!adjunct) continue;

            if (!adjunct.isInitialized) {
                this.initializeAdjunct(world, entityId, adjunct);
            }

            // Note: VisualSyncSystem now handles the Coordinate Sync from TransformComponent -> MeshComponent handle
        }
    }

    private initializeAdjunct(world: World, entityId: EntityId, adjunct: AdjunctComponent) {
        if (!adjunct.logicModule) return;

        const std = adjunct.stdData;
        const logic = adjunct.logicModule;

        // 1. Create Mesh via Factory
        const result = AdjunctFactory.createMesh(world, adjunct.parentBlockEntityId, std, logic);
        world.renderEngine.setObjectUserData(result.handle, "entityId", entityId);
        world.renderEngine.setRaycastable(result.handle, true);

        // 2. Attach MeshComponent for automated syncing
        world.addComponent<MeshComponent>(entityId, "MeshComponent", {
            handle: result.handle
        });

        // 3. Handle Trigger Registration
        this.registerTriggers(world, entityId, result.triggerVolumes);

        // 4. Add Raycast Target for selection
        world.addComponent<RaycastTargetComponent>(entityId, "RaycastTargetComponent", {
            type: "adjunct",
            metadata: {
                index: adjunct.stdData.index,
                name: adjunct.adjunctId
            },
            isHovered: false,
            distanceToCamera: Infinity
        });

        adjunct.isInitialized = true;
        this.initializedAdjuncts.add(entityId);

        if (adjunct.parentBlockEntityId) {
            world.emitSimple("world:block_ready", { blockId: adjunct.parentBlockEntityId });
        }
    }

    private registerTriggers(world: World, entityId: EntityId, volumes: any[]) {
        volumes.forEach(vol => {
            const triggerTypeStr = vol.type === 1 ? 'in' : (vol.type === 2 ? 'out' : 'hold');
            const events: any[] = [{
                type: triggerTypeStr,
                actions: (vol.logic || []).map((l: any) => ({
                    type: 'adjunct',
                    target: l[1]?.[1],
                    method: 'modify',
                    params: [l[1]]
                })),
                oneTime: vol.runOnce
            }];

            world.addComponent(entityId, "TriggerComponent", {
                shape: vol.shape, size: vol.size, offset: vol.offset,
                events, entitiesInside: new Set(), triggeredCount: {}, showHelper: false
            });
        });
    }
}
