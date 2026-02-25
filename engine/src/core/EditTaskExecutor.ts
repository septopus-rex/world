import { World, EntityId } from './World';
import { AdjunctComponent } from './components/AdjunctComponents';
import { TransformComponent } from './components/PlayerComponents';
import { MeshComponent } from './components/VisualizationComponents';
import { EditTask } from './types/EditTask';
import { AdjunctFactory } from './factories/AdjunctFactory';
import { STDObject } from './types/Adjunct';

/**
 * EditTaskExecutor
 * Consumes EditTask commands and applies them to the ECS world.
 * This is the single entry point for all adjunct modifications in Edit Mode.
 */
export class EditTaskExecutor {
    /**
     * Execute a single EditTask.
     * "set" → merge param into stdData, rebuild mesh
     * "delete" → remove entity entirely
     */
    public execute(world: World, task: EditTask): boolean {
        const adjComp = world.getComponent<AdjunctComponent>(task.entityId, "AdjunctComponent");
        if (!adjComp) {
            console.warn(`[EditTaskExecutor] Entity ${task.entityId} has no AdjunctComponent`);
            return false;
        }

        switch (task.action) {
            case 'set':
                return this.executeSet(world, task.entityId, adjComp, task.param);
            case 'delete':
                return this.executeDelete(world, task.entityId);
            default:
                console.warn(`[EditTaskExecutor] Unknown action: ${task.action}`);
                return false;
        }
    }

    /**
     * Apply parameter changes to an adjunct:
     * 1. Merge new values into stdData
     * 2. Destroy old mesh
     * 3. Rebuild mesh from updated stdData via AdjunctFactory
     * 4. Update MeshComponent + TransformComponent
     */
    private executeSet(world: World, entityId: EntityId, adjComp: AdjunctComponent, param: Record<string, any>): boolean {
        const std = adjComp.stdData;

        // Merge — flat key-value (e.g. { x: 5, oy: 200 }) into stdData
        for (const key in param) {
            if (param[key] !== undefined && param[key] !== null) {
                (std as any)[key] = param[key];
            }
        }

        // Remove old mesh
        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            world.renderEngine.removeHandle(meshComp.handle);
        }

        // Rebuild mesh from updated stdData
        const logic = adjComp.logicModule;
        if (!logic) return false;

        const result = AdjunctFactory.createMesh(world, adjComp.parentBlockEntityId, std, logic);
        world.renderEngine.setObjectUserData(result.handle, "entityId", entityId);
        world.renderEngine.setRaycastable(result.handle, true);

        // Update MeshComponent
        if (meshComp) {
            meshComp.handle = result.handle;
        } else {
            world.addComponent<MeshComponent>(entityId, "MeshComponent", { handle: result.handle });
        }

        // Update TransformComponent position from stdData
        const trans = world.getComponent<TransformComponent>(entityId, "TransformComponent");
        if (trans) {
            trans.position[0] = std.ox ?? trans.position[0];
            trans.position[1] = std.oz ?? trans.position[1];
            trans.position[2] = -(std.oy ?? -trans.position[2]);
        }

        console.log(`[EditTaskExecutor] Set ${adjComp.adjunctId} on entity ${entityId}`, param);
        return true;
    }

    private executeDelete(world: World, entityId: EntityId): boolean {
        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            world.renderEngine.removeHandle(meshComp.handle);
        }
        world.destroyEntity(entityId);
        console.log(`[EditTaskExecutor] Deleted entity ${entityId}`);
        return true;
    }
}
