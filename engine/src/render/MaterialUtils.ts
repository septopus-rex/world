import * as THREE from 'three';
import { MeshFactory } from './MeshFactory';

/**
 * isolateMaterial — clone-on-write a mesh's material so per-instance edits
 * (recolour, video map, …) never bleed onto MeshFactory's process-wide CACHED
 * shared material (which every other block using that colour renders with).
 * Idempotent (marks `__isolated`); releases the shared cache ref on first clone.
 * Shared render-layer helper (RenderEngine appearance + MediaScreens video).
 */
export function isolateMaterial(child: THREE.Mesh): THREE.MeshStandardMaterial {
    const cur = child.material as THREE.Material & { __isolated?: boolean };
    if (!cur.__isolated) {
        const cloned = cur.clone() as THREE.Material & { __isolated?: boolean };
        cloned.__isolated = true;
        // Material.clone deep-copies userData — strip the cache identity so the
        // clone is a plain owned material (disposed with the mesh), not a
        // doppelgänger of the cached shared entry.
        cloned.userData = { ...cloned.userData, shared: false, cacheKey: undefined, cacheKind: undefined };
        child.material = cloned;
        if ((cur as any).userData?.shared) MeshFactory.release(cur);
    }
    return child.material as THREE.MeshStandardMaterial;
}
