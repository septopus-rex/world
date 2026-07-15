import * as THREE from 'three';

/**
 * Raycasting / picking — extracted from RenderEngine (intra-layer refactor,
 * still `render/`). Camera-ray → entity picking (Layer 1 only), ray→plane
 * intersection (drag-plane maths for the editor), and world→screen
 * projection. `origin` is the shared FloatingOrigin vector: hits come back in
 * render space and must be shifted by +origin to reach the ABSOLUTE world
 * coords the rest of the engine works in; plane points passed in are
 * ABSOLUTE and must be shifted by −origin before being compared against the
 * render-space ray.
 */
export class Picking {
    private readonly raycaster = new THREE.Raycaster();
    private readonly _tmpVec2 = new THREE.Vector2();
    private readonly _tmpVec3 = new THREE.Vector3();
    private readonly _tmpPlane = new THREE.Plane();
    private readonly _tmpPlaneNormal = new THREE.Vector3();
    private readonly _tmpPlanePoint = new THREE.Vector3();
    private readonly _tmpPlaneTarget = new THREE.Vector3();

    constructor(private readonly scene: THREE.Scene, private readonly origin: THREE.Vector3) { }

    /** Pick the nearest entity-owning object along `camera`'s ray through NDC (ndcX, ndcY) — Layer 1 only. */
    castRay(camera: THREE.Camera, ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        this.raycaster.layers.set(1); // ONLY intersect with objects on Layer 1
        this._tmpVec2.set(ndcX, ndcY);
        this.raycaster.setFromCamera(this._tmpVec2, camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        for (const hit of intersects) {
            let current: THREE.Object3D | null = hit.object;
            while (current) {
                if (current.userData && current.userData.entityId !== undefined) {
                    return {
                        entityId: current.userData.entityId,
                        distance: hit.distance,
                        // hit.point is render space → back to ABSOLUTE world for callers.
                        point: [hit.point.x + this.origin.x, hit.point.y + this.origin.y, hit.point.z + this.origin.z]
                    };
                }
                current = current.parent;
            }
        }
        return null;
    }

    /** Projects a ray from `camera` and intersects it with a mathematical plane (ABSOLUTE world coords in/out). */
    intersectRayWithPlane(camera: THREE.Camera, ndcX: number, ndcY: number, planeNormal: [number, number, number], planePoint: [number, number, number]): [number, number, number] | null {
        this.raycaster.layers.enableAll();
        this._tmpVec2.set(ndcX, ndcY);
        this.raycaster.setFromCamera(this._tmpVec2, camera);

        // planePoint is ABSOLUTE world; the ray is in render space. Define the
        // plane in render space (shift the point by −origin), then shift the
        // hit back.
        this._tmpPlaneNormal.set(planeNormal[0], planeNormal[1], planeNormal[2]);
        this._tmpPlanePoint.set(planePoint[0] - this.origin.x, planePoint[1] - this.origin.y, planePoint[2] - this.origin.z);
        this._tmpPlane.normal.copy(this._tmpPlaneNormal);
        this._tmpPlane.constant = -this._tmpPlaneNormal.dot(this._tmpPlanePoint);

        const result = this.raycaster.ray.intersectPlane(this._tmpPlane, this._tmpPlaneTarget);
        return result ? [result.x + this.origin.x, result.y + this.origin.y, result.z + this.origin.z] : null;
    }

    /** Projects a 3D ABSOLUTE world point to 2D screen coordinates (normalized 0-1 range). */
    worldToScreen(camera: THREE.Camera, x: number, y: number, z: number): { x: number, y: number } {
        this._tmpVec3.set(x - this.origin.x, y - this.origin.y, z - this.origin.z);
        this._tmpVec3.project(camera);

        // Convert -1..1 to 0..1
        return {
            x: (this._tmpVec3.x + 1) / 2,
            y: (-this._tmpVec3.y + 1) / 2
        };
    }
}
