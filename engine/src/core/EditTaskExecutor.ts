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
export interface ExecuteResult {
    success: boolean;
    snapshot?: Record<string, any>;  // stdData clone BEFORE execution (for undo)
}

export class EditTaskExecutor {
    /**
     * Execute a single EditTask.
     * Returns result with pre-execution snapshot for undo support.
     */
    public execute(world: World, task: EditTask): ExecuteResult {
        const adjComp = world.getComponent<AdjunctComponent>(task.entityId, "AdjunctComponent");
        if (!adjComp) {
            console.warn(`[EditTaskExecutor] Entity ${task.entityId} has no AdjunctComponent`);
            return { success: false };
        }

        // Snapshot stdData BEFORE mutation
        const snapshot = JSON.parse(JSON.stringify(adjComp.stdData));

        switch (task.action) {
            case 'set':
                return { success: this.executeSet(world, task.entityId, adjComp, task.param), snapshot };
            case 'delete':
                return { success: this.executeDelete(world, task.entityId), snapshot };
            default:
                console.warn(`[EditTaskExecutor] Unknown action: ${task.action}`);
                return { success: false };
        }
    }

    /**
     * Restore an entity's stdData from a snapshot (for undo).
     */
    public restore(world: World, entityId: EntityId, snapshot: Record<string, any>): boolean {
        const adjComp = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        if (!adjComp) return false;

        // Overwrite stdData with snapshot
        Object.assign(adjComp.stdData, snapshot);

        // Rebuild mesh
        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            world.renderEngine.removeHandle(meshComp.handle);
        }
        const logic = adjComp.logicModule;
        if (!logic) return false;

        const result = AdjunctFactory.createMesh(world, adjComp.parentBlockEntityId, adjComp.stdData, logic);
        world.renderEngine.setObjectUserData(result.handle, "entityId", entityId);
        world.renderEngine.setRaycastable(result.handle, true);
        if (meshComp) meshComp.handle = result.handle;

        return true;
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
