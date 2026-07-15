import { MeshFactory } from './MeshFactory';

/**
 * Dispose a mesh's geometry + material UNLESS they are shared — disposing a
 * shared resource corrupts every other live block/instance that references
 * it. Two shared kinds:
 *   • whole-mesh shared: ResourceManager model clones share the template's
 *     geometry+material by reference (userData.shared on the mesh) → skip all.
 *   • per-resource shared: MeshFactory's process-wide cached geometry + colour
 *     materials (userData.shared on the geometry / material) → skip that one.
 * Only instance-owned (fresh) resources are disposed; shared ones are freed by
 * ResourceManager.release / MeshFactory.clearCache. Stateless + dependency-free
 * (extracted from RenderEngine) so it is unit-testable without a WebGL context.
 */
export function disposeMeshResources(child: any): void {
    // Splat instances (ResourceManager.instance's SplatMesh branch): neither
    // isMesh nor isPoints, so the guard below would otherwise skip it entirely
    // and leak its GPU resources. Each instance owns its own dispose() call
    // (see ResourceManager.instance's doc comment on the sharing simplification).
    if (child?.userData?.isSplatInstance) {
        if (child.userData.__resourcesFreed) return;
        child.userData.__resourcesFreed = true;
        child.dispose?.();
        return;
    }
    if (!child || !(child.isMesh || child.isPoints)) return;
    // Model-clone meshes (ResourceManager instance-many): the TEMPLATE's
    // geometry/materials are ref-counted by ResourceManager — hands off here.
    if (child.userData?.shared) return;
    // Idempotence guard: the same mesh can reach here twice (removeHandle +
    // placeholder-swap paths) — releasing a refcount twice would free an
    // entry other users still render with.
    if (child.userData?.__resourcesFreed) return;
    child.userData.__resourcesFreed = true;
    // MeshFactory-cached (shared) resources are RELEASED (refcount −1;
    // disposed at zero); instance-owned ones are disposed directly.
    const geo = child.geometry;
    if (geo) {
        if (geo.userData?.shared) MeshFactory.release(geo);
        else geo.dispose();
    }
    const one = (m: any) => {
        if (!m) return;
        if (m.userData?.shared) MeshFactory.release(m);
        else m.dispose();
    };
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach(one); else one(mat);
}

/** Stop + free any A/V media attached to a mesh (audio emitter / video screen). */
export function disposeMediaResources(child: any): void {
    const m = child?.userData?.__media;
    if (!m) return;
    if (m.audio) { try { m.audio.stop(); } catch { /* not playing */ } m.audio.disconnect?.(); m.audio.parent?.remove(m.audio); }
    if (m.video) { try { m.video.pause(); } catch { /* already stopped */ } m.video.removeAttribute('src'); m.video.load?.(); }
    m.texture?.dispose?.();
    child.userData.__media = undefined;
}
