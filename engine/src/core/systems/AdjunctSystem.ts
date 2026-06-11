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

    /**
     * Max adjunct MESHES built per frame. Building a mesh (geometry+material via
     * AdjunctFactory) is the heavy cost; when a whole neighbourhood streams in at
     * once, building them all in one frame stalls the renderer. Budgeting spreads
     * the work across frames (frame-split loading) so the 3D stays smooth.
     */
    private static readonly BUILD_BUDGET = 16;

    public update(world: World, deltaTime: number): void {
        const adjunctEntities = world.queryEntities("AdjunctComponent");

        let built = 0;
        for (const entityId of adjunctEntities) {
            const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
            if (!adjunct) continue;

            if (!adjunct.isInitialized) {
                this.initializeAdjunct(world, entityId, adjunct);
                if (++built >= AdjunctSystem.BUILD_BUDGET) break; // rest of the queue next frame
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

    /**
     * Attach the authored trigger volume to the entity. The volume arrives from
     * adjunct_trigger's stdToRenderData already in its final shape:
     * { shape, size, offset, gameOnly, events: TriggerLogicNode[] } — pass it
     * through untouched (re-deriving events here silently dropped the authored
     * JSONLogic nodes).
     */
    private registerTriggers(world: World, entityId: EntityId, volumes: any[]) {
        volumes.forEach(vol => {
            world.addComponent(entityId, "TriggerComponent", {
                shape: vol.shape,
                size: vol.size,
                offset: vol.offset ?? [0, 0, 0],
                gameOnly: !!vol.gameOnly,
                events: vol.events ?? [],
                entitiesInside: new Set(),
                insideMs: new Map(),
                triggeredCount: {},
                showHelper: false
            });
        });
    }
}
