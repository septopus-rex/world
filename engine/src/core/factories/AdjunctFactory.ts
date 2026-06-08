import * as THREE from 'three';
import { World } from '../World';
import { RenderHandle, AdjunctDefinition, RenderObject } from '../types/Adjunct';
import { Coords } from '../utils/Coords';
import { MeshFactory } from '../../render/MeshFactory';
import { Color } from '../utils/Math';
import { BlockComponent } from '../components/BlockComponent';
import { MeshComponent } from '../components/VisualizationComponents';
import type { ResourceManager } from '../services/ResourceManager';

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

                // Module adjuncts: `mesh` is just a loading PLACEHOLDER. Kick off
                // the async model load and swap a real clone in when it resolves
                // (deterministic port of the old engine's replaceFun).
                if (renderItem.type === 'module' && renderItem.resource) {
                    this.scheduleModuleSwap(world, meshGroup, mesh, renderItem, relativePos);
                } else if (renderItem.material?.texture) {
                    // Textured surfaces (box/wall/etc): the mesh shows its colour now;
                    // load the texture and assign it to the material when ready.
                    // Mutually exclusive with module — a module placeholder must not
                    // also pin a texture it never shows.
                    this.scheduleTextureSwap(world, meshGroup, mesh, renderItem);
                }
            }
        } catch (error) {
            console.error(`[AdjunctFactory] Failed to assemble mesh for adjunct.`, error);
        }

        return { handle: meshGroup, triggerVolumes };
    }

    /**
     * Placeholder-then-swap for a module (3D-model) adjunct.
     *
     * createMesh is synchronous but model loading is async, so we:
     *   1. load the model ONCE via ResourceManager (dedup by id — N placements of
     *      the same id trigger ONE fetch + decode),
     *   2. when it resolves, replace the placeholder box with a cheap clone that
     *      shares the decoded geometry/material by reference,
     *   3. scale the clone so its bounding box matches the authored std size,
     *   4. inherit the placeholder's local position/rotation.
     *
     * Hazard handled: the block (and its meshGroup) may be EVICTED before the
     * load resolves. We check the group's __removed flag (set by
     * RenderEngine.removeHandle) BEFORE instancing, so we never leak a clone into
     * a disposed group and never bump the refcount for a dead placement.
     */
    private static scheduleModuleSwap(
        world: World,
        meshGroup: RenderHandle,
        placeholder: RenderHandle,
        renderItem: RenderObject,
        relativePos: number[]
    ): void {
        const rm = (world as any).resourceManager as ResourceManager | undefined;
        const resource = renderItem.resource as string;
        if (!rm || !resource) return;

        rm.getModel(resource).then(() => {
            // Evicted mid-load? Abort — do not instance (no refcount, no leak).
            if (this.isHandleRemoved(meshGroup) || this.isHandleRemoved(placeholder)) return;

            const entry = rm.getModelEntry(resource);
            if (!entry) return;
            const model = rm.instance(resource) as THREE.Object3D;

            // Scale the clone to fit the authored size (decision: honor std size).
            const size = entry.bounds.getSize(new THREE.Vector3());
            const desired = renderItem.params.size;
            const sx = size.x > 1e-6 ? desired[0] / size.x : 1;
            const sy = size.y > 1e-6 ? desired[1] / size.y : 1;
            const sz = size.z > 1e-6 ? desired[2] / size.z : 1;
            model.scale.set(sx, sy, sz);

            // Inherit the placeholder's local pose within the group.
            world.renderEngine.setObjectPosition(model, relativePos[0], relativePos[1], relativePos[2]);
            world.renderEngine.setObjectRotation(model,
                renderItem.params.rotation[0] || 0,
                renderItem.params.rotation[1] || 0,
                renderItem.params.rotation[2] || 0
            );

            // Swap: add the model, remove the placeholder. Record the resource on
            // the group so block eviction can release() exactly one clone per id.
            world.renderEngine.addObjectToGroup(meshGroup, model);
            world.renderEngine.removeHandle(placeholder);

            const ud = (meshGroup as any).userData ?? ((meshGroup as any).userData = {});
            ud.loadedResources = [...(ud.loadedResources ?? []), resource];
        }).catch((err: any) => {
            // Load failed / unsupported format — keep the placeholder box visible.
            console.warn(`[AdjunctFactory] module ${resource} load failed; keeping placeholder.`, err?.message ?? err);
        });
    }

    /**
     * Async texture application for a textured surface. The mesh renders with its
     * solid colour immediately; the texture is loaded ONCE per id (shared by
     * reference across every surface using it) and assigned as .map when ready.
     * Texel density is already handled at the geometry level (size-derived UV
     * tiling in MeshFactory), so a low-res image won't go mosaic on a big face.
     *
     * Eviction-safe: skips assignment if the group was removed mid-load, and
     * records the texture id on the group so block eviction releases it (ref-count).
     */
    private static scheduleTextureSwap(
        world: World,
        meshGroup: RenderHandle,
        mesh: RenderHandle,
        renderItem: RenderObject
    ): void {
        const rm = (world as any).resourceManager as ResourceManager | undefined;
        const texId = renderItem.material?.texture as string | undefined;
        if (!rm || !texId) return;
        // Texel density is handled by size-derived UV tiling (MeshFactory), so we do
        // NOT pass a per-surface repeat: a texture is shared by reference, its
        // `.repeat` is one value per id (taken from the texture record). Per-surface
        // repeat would silently be first-writer-wins on the shared texture.
        rm.getTexture(texId).then((tex: THREE.Texture) => {
            if (this.isHandleRemoved(meshGroup)) return; // evicted mid-load — don't retain

            const mat = (mesh as THREE.Mesh).material as any;
            const assign = (m: any) => { if (m) { m.map = tex; m.needsUpdate = true; } };
            if (Array.isArray(mat)) mat.forEach(assign); else assign(mat);

            rm.retainTexture(texId);
            const ud = (meshGroup as any).userData ?? ((meshGroup as any).userData = {});
            ud.loadedTextures = [...(ud.loadedTextures ?? []), texId];
        }).catch((err: any) => {
            console.warn(`[AdjunctFactory] texture ${texId} load failed; keeping solid colour.`, err?.message ?? err);
        });
    }

    /** True if a handle has been removed/disposed (set by RenderEngine.removeHandle). */
    private static isHandleRemoved(handle: RenderHandle): boolean {
        return !!(handle as any)?.userData?.__removed;
    }

    /**
     * Release the model/texture resources an adjunct's mesh group instanced
     * (recorded on the group's userData by the swap callbacks). Call this BEFORE
     * removeHandle anywhere a textured/model adjunct's handle is torn down — block
     * eviction AND edit-mode set/delete/restore — so ResourceManager ref-counts
     * return to 0 and the shared file is freed. Clears the records so a second call
     * (or a rebuilt handle) can't double-release.
     */
    public static releaseHandleResources(world: World, handle: RenderHandle): void {
        const ud = (handle as any)?.userData;
        const rm = (world as any).resourceManager as ResourceManager | undefined;
        if (!ud || !rm) return;
        if (Array.isArray(ud.loadedResources)) {
            for (const id of ud.loadedResources) rm.release(id);
            ud.loadedResources = [];
        }
        if (Array.isArray(ud.loadedTextures)) {
            for (const id of ud.loadedTextures) rm.releaseTexture(id);
            ud.loadedTextures = [];
        }
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
