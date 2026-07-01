import { World } from '../World';
import { reportError, ResourceError } from '../errors';
import { RenderHandle, AdjunctDefinition, RenderObject, MediaConfig } from '../types/Adjunct';
import { Coords } from '../utils/Coords';
import { MeshFactory } from '../../render/MeshFactory';
import { Color } from '../utils/Math';
import { BlockComponent } from '../components/BlockComponent';
import { MeshComponent } from '../components/VisualizationComponents';
import type { ResourceManager } from '../../render/ResourceManager';

export interface IAdjunctCreationResult {
    handle: RenderHandle;
    triggerVolumes: any[];
    /** b5 item payloads ({templateId, seed, count}) — AdjunctSystem → ItemComponent. */
    itemPickups: any[];
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
        const itemPickups: any[] = [];

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
                if (renderItem.itemPickup) {
                    itemPickups.push(renderItem.itemPickup);
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

                // A/V media (audio emitter / video screen): resolve the source, then
                // attach a PositionalAudio / VideoTexture on the mesh (render layer).
                if (renderItem.media?.source) {
                    this.scheduleMediaAttach(world, meshGroup, mesh, renderItem.media);
                }
            }
        } catch (error) {
            console.error(`[AdjunctFactory] Failed to assemble mesh for adjunct.`, error);
        }

        return { handle: meshGroup, triggerVolumes, itemPickups };
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
            const model = rm.instance(resource) as any;

            // Scale the clone to fit the authored size (decision: honor std size).
            const [bx, by, bz] = entry.boundsSize;
            const desired = renderItem.params.size;
            const sx = bx > 1e-6 ? desired[0] / bx : 1;
            const sy = by > 1e-6 ? desired[1] / by : 1;
            const sz = bz > 1e-6 ? desired[2] / bz : 1;
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
        }).catch((err: unknown) => {
            // Load failed / unsupported format — keep the placeholder box visible.
            // No `kind` here: ResourceManager already emitted resource.failed for the
            // underlying load; this is the consumer's graceful-degradation notice.
            reportError(new ResourceError(`module ${resource} load failed; keeping placeholder`, { cause: err }), { tag: '[AdjunctFactory]', severity: 'warn' });
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
        rm.getTexture(texId).then((tex: any) => {
            if (this.isHandleRemoved(meshGroup)) return; // evicted mid-load — don't retain

            const mat = (mesh as any).material;
            const assign = (m: any) => { if (m) { m.map = tex; m.needsUpdate = true; } };
            if (Array.isArray(mat)) mat.forEach(assign); else assign(mat);

            rm.retainTexture(texId);
            const ud = (meshGroup as any).userData ?? ((meshGroup as any).userData = {});
            ud.loadedTextures = [...(ud.loadedTextures ?? []), texId];
        }).catch((err: unknown) => {
            reportError(new ResourceError(`texture ${texId} load failed; keeping solid colour`, { cause: err }), { tag: '[AdjunctFactory]', severity: 'warn' });
        });
    }

    /** True if a handle has been removed/disposed (set by RenderEngine.removeHandle). */
    private static isHandleRemoved(handle: RenderHandle): boolean {
        return !!(handle as any)?.userData?.__removed;
    }

    /**
     * Resolve an A/V media source to a URL (ResourceManager, same IPFS spine as
     * models/textures) then attach it in the render layer: audio → a looping
     * PositionalAudio on the mesh, video → a VideoTexture on its material. The
     * <video>/audio are stopped + freed by RenderEngine.removeHandle on eviction.
     * If the group is evicted mid-resolve, skip (never attach to a dead mesh).
     * See specs/av-media-adjuncts.md.
     */
    private static scheduleMediaAttach(world: World, meshGroup: RenderHandle, mesh: RenderHandle, media: MediaConfig): void {
        const rm = (world as any).resourceManager as ResourceManager | undefined;
        if (!rm) return;
        const resolve = media.kind === 'video' ? rm.getVideoUrl(media.source) : rm.getAudioUrl(media.source);
        resolve.then((url: string) => {
            if (this.isHandleRemoved(meshGroup)) return; // evicted mid-load
            if (media.kind === 'video') {
                world.renderEngine.attachVideoScreen(mesh, url, {
                    autoplay: media.autoplay, loop: media.loop, muted: media.muted, volume: media.volume,
                });
            } else {
                world.renderEngine.attachAudioEmitter(mesh, url, {
                    autoplay: media.autoplay, loop: media.loop, volume: media.volume, refDistance: media.refDistance,
                });
            }
        }).catch((err: unknown) => {
            reportError(new ResourceError(`media ${media.kind} '${media.source}' failed to attach`, { cause: err }), { tag: '[AdjunctFactory]', severity: 'warn' });
        });
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
