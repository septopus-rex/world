import { World, EntityId } from './World';
import { AdjunctType } from './types/AdjunctType';
import { AdjunctComponent } from './components/AdjunctComponents';
import { TransformComponent } from './components/PlayerComponents';
import { MeshComponent } from './components/VisualizationComponents';
import { EditTask } from './types/EditTask';
import { AdjunctFactory } from './factories/AdjunctFactory';
import { STDObject } from './types/Adjunct';
import { setByPath } from './edit/setByPath';
import { normalizeSppFaces } from './spp/faceCodes';

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
        // 'add' creates the entity, so it runs before the existing-component guard.
        if (task.action === 'add') {
            return this.executeAdd(world, task);
        }

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
     * Place a NEW adjunct into a block (palette placement).
     * param: { typeId, blockEntityId, raw } — raw is a full serialized row
     * (see AdjunctDefaults). Reuses BlockSystem.spawnAdjunct (the item-drop
     * path), so the entity gets the standard component set and AdjunctSystem
     * builds its mesh on the next frame. The spawned entity id is written back
     * onto task.entityId so history/undo can target it.
     */
    private executeAdd(world: World, task: EditTask): ExecuteResult {
        const { typeId, blockEntityId, raw } = task.param ?? {};
        const blockSystem = world.systems.findSystemByName('BlockSystem') as any;
        if (typeId == null || blockEntityId == null || !Array.isArray(raw) || !blockSystem?.spawnAdjunct) {
            console.warn(`[EditTaskExecutor] add: invalid param`, task.param);
            return { success: false };
        }
        const eid = blockSystem.spawnAdjunct(world, blockEntityId, typeId, raw);
        if (eid === null || eid === undefined) return { success: false };

        task.entityId = eid;
        console.log(`[EditTaskExecutor] Added adjunct type 0x${Number(typeId).toString(16)} as entity ${eid}`);
        // Undo of an add = delete the spawned entity (restore() dispatches on this marker).
        return { success: true, snapshot: { __action: 'add' } };
    }

    /**
     * Restore an entity's stdData from a snapshot (for undo).
     * An 'add' snapshot undoes by deleting the entity it created.
     */
    public restore(world: World, entityId: EntityId, snapshot: Record<string, any>): boolean {
        if (snapshot?.__action === 'add') {
            return this.executeDelete(world, entityId);
        }

        const adjComp = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        if (!adjComp) return false;

        // Overwrite stdData with snapshot
        Object.assign(adjComp.stdData, snapshot);

        // Rebuild mesh
        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            // Release model/texture refs this adjunct held BEFORE disposing its
            // handle, else edit set/delete/restore leaks ResourceManager refcounts
            // (set also re-retains on every rebuild → monotonic climb).
            AdjunctFactory.releaseHandleResources(world, meshComp.handle);
            world.renderEngine.removeHandle(meshComp.handle);
        }
        const logic = adjComp.logicModule;
        if (!logic) return false;

        const result = AdjunctFactory.createMesh(world, adjComp.parentBlockEntityId, adjComp.stdData, logic);
        world.renderEngine.setObjectUserData(result.handle, "entityId", entityId);
        world.renderEngine.setRaycastable(result.handle, true);
        if (meshComp) meshComp.handle = result.handle;

        // Source adjunct (b6 spp / c2 motif): re-expand derived pieces to
        // match the restored data.
        const restoredType = (adjComp.stdData as any).typeId;
        if (restoredType === AdjunctType.Spp || restoredType === AdjunctType.Motif) {
            (world.systems.findSystemByName('BlockSystem') as any)?.reexpandSource?.(world, entityId);
        }

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

        // Merge form values into stdData. Keys may be dotted paths so nested
        // properties bind (box "material.resource", SPP "cells.0.faces.2").
        for (const key in param) {
            if (param[key] !== undefined && param[key] !== null) {
                setByPath(std as any, key, param[key]);
            }
        }

        // Remove old mesh
        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            // Release model/texture refs this adjunct held BEFORE disposing its
            // handle, else edit set/delete/restore leaks ResourceManager refcounts
            // (set also re-retains on every rebuild → monotonic climb).
            AdjunctFactory.releaseHandleResources(world, meshComp.handle);
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
            // Keep rotation in sync too, so keyboard/gizmo rotation holds (and a
            // later VisualSync pass doesn't overwrite the rebuilt mesh's rotation).
            if (std.rx != null) trans.rotation[0] = std.rx;
            if (std.ry != null) trans.rotation[1] = std.ry;
            if (std.rz != null) trans.rotation[2] = std.rz;
        }

        // Source adjunct (b6/c2): fold particle face-codes into cells, then
        // re-expand the derived pieces live (the source's own mesh is a hidden
        // marker).
        const setType = (std as any).typeId;
        if (setType === AdjunctType.Spp) normalizeSppFaces(std);
        if (setType === AdjunctType.Spp || setType === AdjunctType.Motif) {
            (world.systems.findSystemByName('BlockSystem') as any)?.reexpandSource?.(world, entityId);
        }

        console.log(`[EditTaskExecutor] Set ${adjComp.adjunctId} on entity ${entityId}`, param);
        return true;
    }

    private executeDelete(world: World, entityId: EntityId): boolean {
        // SPP source: also drop its derived pieces (else deleting/undoing a placed
        // spp source leaves orphan walls).
        const adj = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        if (adj?.stdData?.typeId === AdjunctType.Spp) {
            (world.systems.findSystemByName('BlockSystem') as any)?.destroyDerived?.(world, adj.adjunctId);
        }

        const meshComp = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (meshComp?.handle) {
            // Release model/texture refs this adjunct held BEFORE disposing its
            // handle, else edit set/delete/restore leaks ResourceManager refcounts
            // (set also re-retains on every rebuild → monotonic climb).
            AdjunctFactory.releaseHandleResources(world, meshComp.handle);
            world.renderEngine.removeHandle(meshComp.handle);
        }
        world.destroyEntity(entityId);
        console.log(`[EditTaskExecutor] Deleted entity ${entityId}`);
        return true;
    }
}
