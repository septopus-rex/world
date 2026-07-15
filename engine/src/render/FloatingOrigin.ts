import * as THREE from 'three';

/**
 * Floating origin — extracted from RenderEngine (intra-layer refactor, still
 * `render/`). The Septopus world spans tens of kilometres (4096 blocks × 16 m,
 * spawn at the CENTRE ≈ 32 km from origin). At those magnitudes float32 — what
 * the GPU uses — resolves to ~4 mm, which wrecks shadow-coordinate maths and
 * produces distance-dependent shadow acne ("waves"). Fix: all WORLD content
 * hangs off `root`, offset by −`origin`; RenderEngine offsets the cameras to
 * match, so everything the GPU sees sits near 0. The ECS keeps absolute
 * float64 coords (physics/triggers untouched) — RenderEngine converts at the
 * render boundary using `origin`. `maybeRebase` is O(1) (just moves `root`)
 * and is checked once per frame.
 */
export class FloatingOrigin {
    /** All world content (adjunct meshes, avatars, particles…) hangs off this,
     *  offset by −`origin`, so render-space coords stay small. */
    readonly root: THREE.Group;
    /** Last rebase anchor, in ABSOLUTE world coords. Mutated in place by
     *  maybeRebase — callers that hold this reference see updates for free
     *  (same object identity across rebases). */
    readonly origin = new THREE.Vector3(0, 0, 0);

    private static readonly REBASE_THRESHOLD = 1024;

    constructor(scene: THREE.Scene) {
        this.root = new THREE.Group();
        scene.add(this.root);
    }

    /**
     * Re-anchor onto `cameraAbs` once it strays past REBASE_THRESHOLD from the
     * current origin, moving `root` so render-space coords stay small. Returns
     * true iff a rebase happened — the caller (RenderEngine) must then
     * re-derive anything ELSE expressed in render-space that this class
     * doesn't own: the main camera position and the minimap pass.
     */
    maybeRebase(cameraAbs: THREE.Vector3): boolean {
        if (cameraAbs.distanceToSquared(this.origin) <= FloatingOrigin.REBASE_THRESHOLD * FloatingOrigin.REBASE_THRESHOLD) return false;
        this.origin.copy(cameraAbs);
        this.root.position.set(-this.origin.x, -this.origin.y, -this.origin.z);
        this.root.updateMatrixWorld(true);
        return true;
    }
}
