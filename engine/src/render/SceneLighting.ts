import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';

/**
 * Scene-wide lighting — extracted from RenderEngine (intra-layer refactor,
 * still `render/`). Owns ambient/hemisphere/directional lights, distance fog,
 * and the shadow-casting sun's per-frame anchor. The FIRST directional light
 * added becomes the sun (see setDirectional): its authored position only
 * encodes a DIRECTION — the world spans tens of kilometres while a
 * directional shadow camera covers ~100 m — so anchorSunShadow re-centres it
 * on the camera every frame (called from RenderEngine.render()).
 */
export class SceneLighting {
    private sun: THREE.DirectionalLight | null = null;
    private sunDir = new THREE.Vector3(0.45, 0.89, 0.45);

    constructor(private readonly scene: THREE.Scene) { }

    /** The shadow-casting sun, if one has been set via setDirectional. */
    get sunLight(): THREE.DirectionalLight | null { return this.sun; }

    setAmbient(color: number, intensity: number): RenderHandle {
        const light = new THREE.AmbientLight(color, intensity);
        this.scene.add(light);
        return light;
    }

    updateAmbient(light: RenderHandle, color: number, intensity: number): void {
        const l = light as THREE.AmbientLight;
        l.color.setHex(color);
        l.intensity = intensity;
    }

    setHemisphere(skyColor: number, groundColor: number, intensity: number): RenderHandle {
        const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
        this.scene.add(light);
        return light;
    }

    /**
     * Distance fog matching the sky. Blocks stream in a bounded window, so the
     * far edge of the loaded region is a hard chunk boundary against the sky;
     * fading it into the sky colour hides that staircase. `near`/`far` are
     * sized to the load window by the caller. Colour defaults to the scene
     * background so terrain dissolves seamlessly. (Distance is
     * camera-relative → unaffected by the floating origin.)
     */
    setFog(near: number, far: number, color?: number): void {
        const c = color ?? (this.scene.background instanceof THREE.Color ? this.scene.background.getHex() : 0x87ceeb);
        this.scene.fog = new THREE.Fog(c, near, far);
    }

    setDirectional(color: number, intensity: number, x: number, y: number, z: number): RenderHandle {
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(x, y, z);
        this.scene.add(light);

        // The FIRST directional light becomes the shadow-casting "sun". Its
        // authored position only encodes the DIRECTION — the world spans tens
        // of kilometres while a directional shadow camera covers ~100 m —
        // anchorSunShadow re-anchors around the main camera every frame.
        if (!this.sun) {
            this.sun = light;
            if ((x * x + y * y + z * z) > 1e-6) this.sunDir.set(x, y, z).normalize();
            light.castShadow = true;
            light.shadow.mapSize.set(1024, 1024);
            const cam = light.shadow.camera;
            cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80;
            cam.near = 1; cam.far = 400;
            // Shadow bias — WITHOUT this the flat ground self-shadows. It looks
            // fine when the sun is overhead (noon) but as the sun arcs to a
            // grazing angle each shadow texel smears across the ground and the
            // surface shadows itself, producing regular moiré "waves".
            // normalBias offsets the sample along the surface normal (the right
            // fix for grazing angles); the small constant bias handles the
            // residual depth-compare acne. Kept modest so the avatar's contact
            // shadow doesn't peter-pan off its feet.
            light.shadow.bias = -0.0005;
            light.shadow.normalBias = 0.05;
            this.scene.add(light.target);
        }
        return light;
    }

    updateDirectional(light: RenderHandle, color: number, intensity: number, x: number, y: number, z: number): void {
        const l = light as THREE.DirectionalLight;
        l.color.setHex(color);
        l.intensity = intensity;
        l.position.set(x, y, z);
        // For the sun, the authored position encodes its DIRECTION (sun cycle
        // around the origin) — record it; anchorSunShadow re-bases the actual
        // position around the camera each frame.
        if (l === this.sun && (x * x + y * y + z * z) > 1e-6) {
            this.sunDir.set(x, y, z).normalize();
        }
    }

    /** Keep the sun's shadow frustum centred on `anchor` (the main camera
     *  position). Called once per render(). */
    anchorSunShadow(anchor: THREE.Vector3): void {
        const sun = this.sun;
        if (!sun) return;
        sun.target.position.copy(anchor);
        sun.position.copy(anchor).addScaledVector(this.sunDir, 150);
        sun.target.updateMatrixWorld();
    }
}
