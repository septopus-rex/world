import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { SparkRenderer } from '@sparkjsdev/spark';
import { RenderHandle } from '../core/types/Adjunct';
import { reportError, EngineError } from '../core/errors';
import { SpatialAudio } from './SpatialAudio';
import { AvatarAnimator } from './AvatarAnimator';
import { MinimapPass } from './MinimapPass';
import { MediaScreens } from './MediaScreens';
import { isolateMaterial } from './MaterialUtils';
import { MeshFactory } from './MeshFactory';
import { ParticleFX } from './ParticleFX';
import { EditorHelpers } from './EditorHelpers';
import { TransformGizmo, GizmoHooks, GizmoInfo } from './TransformGizmo';
import { FloatingOrigin } from './FloatingOrigin';
import { SceneLighting } from './SceneLighting';
import { Picking } from './Picking';
import { disposeMeshResources, disposeMediaResources } from './HandleDisposal';

export interface RenderEngineConfig {
    containerId: string;
    clearColor?: number;
    stats?: boolean;
    /** Start with the sun's shadow map on (default off — see the constructor). */
    shadows?: boolean;
}

export enum CameraType {
    Main = 'main',
    Minimap = 'minimap'
}

/**
 * RenderEngine abstracts the underlying 3D rendering library (Three.js).
 * It manages the Scene, Cameras, and Renderer instances.
 */
export class RenderEngine {
    private scene: THREE.Scene;
    private mainCamera: THREE.PerspectiveCamera;
    private readonly minimap = new MinimapPass();
    private readonly media = new MediaScreens();
    private renderer: THREE.WebGLRenderer;
    private container: HTMLElement;
    private stats: Stats | null = null;

    // ── Floating origin ────────────────────────────────────────────────────────
    // See render/FloatingOrigin.ts for the full rationale (float32 precision at
    // the Septopus world's ~32 km scale). All world content hangs off
    // `floatingOrigin.root`; the cameras are offset to match at the render
    // boundary (this class is the only place that does that translation — the
    // ECS keeps absolute float64 coords throughout).
    private readonly floatingOrigin: FloatingOrigin;
    private worldRoot!: THREE.Group;
    private _cameraAbs = new THREE.Vector3();   // last ABSOLUTE main-camera position

    /** Render-space ↔ absolute-world conversion origin — see FloatingOrigin. */
    private get renderOrigin(): THREE.Vector3 { return this.floatingOrigin.origin; }

    // Scene-wide lighting (ambient/hemisphere/directional + fog + sun-shadow
    // anchor) — delegated to render/SceneLighting.
    private readonly lighting: SceneLighting;
    /** The shadow-casting sun (first directional light set via setDirectionalLight). */
    private get sunLight(): THREE.DirectionalLight | null { return this.lighting.sunLight; }

    // Raycasting / picking — delegated to render/Picking.
    private readonly picking: Picking;

    // Reusable scratch objects to avoid per-call allocations
    private _tmpBox3 = new THREE.Box3();
    private _tmpSize = new THREE.Vector3();

    // O(1) entityId → Object3D index (populated by setObjectUserData)
    private _entityObjectIndex = new Map<string | number, THREE.Object3D>();

    /** True between webglcontextlost and webglcontextrestored — render() no-ops
     *  (drawing into a dead context throws). Simulation keeps stepping. */
    private _contextLost = false;

    /** Frame counter for render-side throttles (label proximity gate). */
    private _frameCount = 0;

    // Skeletal animation — delegated to render/AvatarAnimator.
    private readonly animator = new AvatarAnimator();

    // Particle effects + editor helper visuals — delegated (see ParticleFX /
    // EditorHelpers). Instantiated in the constructor once worldRoot exists.
    private readonly particles: ParticleFX;
    private readonly editorHelpers: EditorHelpers;

    constructor(config: RenderEngineConfig) {
        const domElement = document.getElementById(config.containerId);
        if (!domElement) {
            throw new Error(`Container with ID ${config.containerId} not found.`);
        }
        this.container = domElement;

        // 1. Initialize Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.clearColor ?? 0x87ceeb);

        // All world content hangs off worldRoot (offset by −renderOrigin); only the
        // cameras and the global lights are direct scene children. See
        // render/FloatingOrigin.ts for the rationale.
        this.floatingOrigin = new FloatingOrigin(this.scene);
        this.worldRoot = this.floatingOrigin.root;
        this.particles = new ParticleFX(this.worldRoot);
        this.editorHelpers = new EditorHelpers(this.worldRoot);
        this.picking = new Picking(this.scene, this.floatingOrigin.origin);

        // 2. Initialize Main Camera
        const aspect = this.container.clientWidth > 0 ? (this.container.clientWidth / this.container.clientHeight) : 1;
        this.mainCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
        this.mainCamera.rotation.order = 'YXZ'; // Prevent tilting and gimbal lock
        this.mainCamera.position.set(0, 10, 20);


        // Enable Layer 1 for Selection in Main Camera
        this.mainCamera.layers.enable(1);

        // 4. Initialize Renderer
        // powerPreference: ask the OS for the discrete GPU on dual-GPU machines
        // (a MacBook left on its integrated GPU is a common cause of a trivial
        // scene running at ~15 FPS).
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        this.renderer.setSize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
        // Cap the device-pixel-ratio: the per-frame cost here is fragment/fill-bound
        // (PBR + shadows over the whole viewport), which scales with pixel COUNT. On
        // a Retina display devicePixelRatio=2 quadruples the pixels for marginal
        // sharpness; cap at 1.5 so a weak/integrated GPU isn't fill-bound.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.autoClear = true;
        // Color management: render in sRGB so albedo textures aren't gamma-wrong
        // (linear-treated-as-sRGB). Color textures are tagged SRGBColorSpace on load.
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        // Shadows: OFF by default pending bias tuning — the grazing-angle moiré
        // made them unstable and distracting. Everything else is wired (the sun's
        // castShadow + bias in SceneLighting, cast/receive flags on every mesh), so
        // this is the single master switch — flip it live via setShadowsEnabled to
        // A/B quality and cost. (The day/night cycle is live in EnvironmentSystem,
        // so leaving it on through a sun arc is how you see the grazing-angle case.)
        this.renderer.shadowMap.enabled = config.shadows ?? false;
        // Filter: PCF. Not a compromise — in three r183 `PCFSoftShadowMap` is
        // DEPRECATED (it silently falls back to this, with a console warning),
        // because the PCF path was rewritten to be both softer and cheaper than
        // the old "soft" variant: 5 taps on a Vogel disk, rotated per pixel by
        // interleaved gradient noise, each tap a hardware `sampler2DShadow`
        // compare (= 4-tap bilinear) — ~20 effective taps for 5 fetches, with
        // the banding-prone regular grid replaced by a noise-rotated disk.
        // The alternatives are worse for us: VSMShadowMap needs float render
        // targets plus a separate two-pass blur AND promotes every receiver to a
        // caster (light bleeding on top); BasicShadowMap is one raw tap (hard,
        // aliased edges). Softness is `shadow.radius` in SceneLighting — the tap
        // COUNT is fixed at 5, so widening the penumbra there is free.
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // WebGL context loss (hardening ③): a GPU reset / driver crash fires
        // `webglcontextlost` — without preventDefault the context can NEVER be
        // restored and the canvas stays black forever. While lost, render() is a
        // no-op (drawing into a dead context throws). On restore, Three re-uploads
        // GPU resources lazily; we just resume drawing. Both edges are reported so
        // the host can toast the user.
        this.renderer.domElement.addEventListener('webglcontextlost', (e: Event) => {
            e.preventDefault(); // required — allows the browser to restore the context
            this._contextLost = true;
            reportError(new EngineError('[render] WebGL context lost — rendering paused', {
                code: 'RENDER_CONTEXT', userMessage: '图形上下文丢失,渲染已暂停(等待恢复)',
            }), { tag: '[RenderEngine]', severity: 'error' });
        });
        this.renderer.domElement.addEventListener('webglcontextrestored', () => {
            this._contextLost = false;
            reportError(new EngineError('[render] WebGL context restored — rendering resumed', {
                code: 'RENDER_CONTEXT', userMessage: '图形上下文已恢复',
            }), { tag: '[RenderEngine]', severity: 'warn' });
        });

        // Gaussian-splat rendering (Spark): one SparkRenderer per scene, added
        // directly to the scene (like a light) rather than worldRoot — it holds
        // no world content itself, just the batched sort/render pass for whatever
        // SplatMesh instances are currently in the scene graph. Not kept as a
        // field: nothing reads it back after construction.
        this.scene.add(new SparkRenderer({ renderer: this.renderer }));

        // Spatial audio subsystem (render/SpatialAudio) — the listener rides the
        // camera, positional sounds add to worldRoot. Autoplay-policy gate + LRU
        // buffer cache live inside it; this facade just forwards.
        this.audio = new SpatialAudio(this.mainCamera, this.worldRoot);

        // Scene-wide lighting (render/SceneLighting) — ambient/hemisphere/
        // directional lights, fog, and the sun-shadow anchor.
        this.lighting = new SceneLighting(this.scene);

        // 5. Default Lighting (dim ambient so adjunct lights are visible)
        this.lighting.setHemisphere(0xffffff, 0x444444, 0.3);

        // 6. Stats (optional performance monitor)
        if (config.stats) {
            this.stats = new Stats();
            this.stats.dom.style.position = 'absolute';
            this.stats.dom.style.top = '10px';
            this.stats.dom.style.left = '10px';
            this.container.appendChild(this.stats.dom);
        }
    }

    /** Max supported texture anisotropy (for ResourceManager to raise on textures). */
    public getMaxAnisotropy(): number {
        return this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
    }

    public get mainCameraInstance(): THREE.PerspectiveCamera { return this.mainCamera; }
    public get minimapCameraInstance(): THREE.OrthographicCamera { return this.minimap.cameraInstance; }
    public get sceneInstance(): THREE.Scene { return this.scene; }
    public get domElement(): HTMLCanvasElement { return this.renderer.domElement; }

    /**
     * Camera Abstraction
     */
    public setMainCameraPosition(x: number, y: number, z: number): void {
        // Caller passes ABSOLUTE world coords; the camera renders in origin-relative
        // space (see floating origin).
        this._cameraAbs.set(x, y, z);
        this.mainCamera.position.set(x - this.renderOrigin.x, y - this.renderOrigin.y, z - this.renderOrigin.z);
    }

    public getMainCameraRotation(): [number, number, number] {
        return [this.mainCamera.rotation.x, this.mainCamera.rotation.y, this.mainCamera.rotation.z];
    }

    public setMainCameraRotation(x: number, y: number, z: number): void {
        this.mainCamera.rotation.set(x, y, z);
    }

    /** Point the main camera at a world target (Observe mode orbit). Three derives
     *  the orientation; getMainCameraRotation stays consistent afterwards. */
    public setMainCameraLookAt(x: number, y: number, z: number): void {
        this.mainCamera.lookAt(x - this.renderOrigin.x, y - this.renderOrigin.y, z - this.renderOrigin.z);
    }

    public updateMainCameraProjection(): void {
        this.mainCamera.updateProjectionMatrix();
    }

    /**
     * Minimap Abstraction
     */
    public setMinimapZoom(zoom: number): void { this.minimap.setZoom(zoom); }

    public setMinimapPosition(x: number, y: number, z: number): void { this.minimap.setPosition(x, y, z, this.renderOrigin); }

    public setMinimapLookAt(x: number, y: number, z: number): void { this.minimap.setLookAt(x, y, z, this.renderOrigin); }

    public getMinimapPosition(): [number, number, number] { return this.minimap.getPosition(this.renderOrigin); }

    /**
     * General Object Abstraction
     */
    public setObjectPosition(handle: RenderHandle, x: number, y: number, z: number): void {
        (handle as THREE.Object3D).position.set(x, y, z);
    }

    public setObjectRotation(handle: RenderHandle, x: number, y: number, z: number): void {
        // Adjunct rotation = engine-frame Euler, default XYZ order, radians, about
        // center (NOT heading-converted; only player yaw is). Normative cross-engine
        // contract: docs/architecture/coordinate.md §3.1. Camera uses YXZ (see :92).
        (handle as THREE.Object3D).rotation.set(x, y, z);
    }

    public setObjectScale(handle: RenderHandle, x: number, y: number, z: number): void {
        (handle as THREE.Object3D).scale.set(x, y, z);
    }

    /**
     * Converts a world-space position into the local space of an object's parent.
     * Use this instead of calling Three.js worldToLocal() directly from ECS systems.
     */
    private _tmpLocal = new THREE.Vector3();
    public worldToLocal(handle: RenderHandle, x: number, y: number, z: number): [number, number, number] {
        const obj = handle as THREE.Object3D;
        if (obj.parent && obj.parent.type !== 'Scene') {
            // (x,y,z) is ABSOLUTE world; Three works in origin-relative render space.
            // The origin cancels in the parent transform (worldRoot stores absolute
            // local coords; nested parents return within-parent offsets either way).
            this._tmpLocal.set(x - this.renderOrigin.x, y - this.renderOrigin.y, z - this.renderOrigin.z);
            obj.parent.worldToLocal(this._tmpLocal);
            return [this._tmpLocal.x, this._tmpLocal.y, this._tmpLocal.z];
        }
        return [x, y, z];
    }

    public setObjectVisible(handle: RenderHandle, visible: boolean): void {
        (handle as THREE.Object3D).visible = visible;
    }

    public getObjectSize(handle: RenderHandle): [number, number, number] {
        this._tmpBox3.setFromObject(handle as THREE.Object3D);
        this._tmpBox3.getSize(this._tmpSize);
        return [this._tmpSize.x, this._tmpSize.y, this._tmpSize.z];
    }

    public setRaycastable(handle: RenderHandle, state: boolean): void {
        const obj = handle as THREE.Object3D;
        const layer = state ? 1 : 0;
        obj.traverse((child) => {
            child.layers.set(layer);
        });
    }

    public createGroup(parent?: RenderHandle): RenderHandle {
        const group = new THREE.Group();
        if (parent) {
            (parent as THREE.Object3D).add(group);
        } else {
            this.worldRoot.add(group);
        }
        return group;
    }

    public addObjectToGroup(group: RenderHandle, object: RenderHandle): void {
        (group as THREE.Group).add(object as THREE.Object3D);
    }

    public setObjectUserData(handle: RenderHandle, key: string, value: any): void {
        (handle as THREE.Object3D).userData[key] = value;
        // Keep entityId index in sync
        if (key === 'entityId') {
            this._entityObjectIndex.set(value, handle as THREE.Object3D);
        }
    }

    /**
     * Per-object colour/opacity override (SPP animation overrides + gameplay
     * recolour). Isolated per-object: MeshFactory hands out one cached material
     * shared by every mesh of the same colour, so mutating it in place would
     * recolour ALL of them — clone-on-write first (see isolateMaterial).
     */
    public updateObjectAppearance(handle: RenderHandle, color?: number, opacity?: number): void {
        if (color === undefined && opacity === undefined) return;
        (handle as THREE.Object3D).traverse((child) => {
            if (!(child instanceof THREE.Mesh) || !child.material) return;
            const mat = isolateMaterial(child as THREE.Mesh);
            if (color !== undefined) mat.color.setHex(color);
            if (opacity !== undefined) {
                mat.opacity = opacity;
                mat.transparent = opacity < 1.0;
            }
        });
    }

    /**
     * Set opacity on ONE object without bleeding into the shared, cached
     * materials MeshFactory hands out (many wall pieces reference one material —
     * mutating it in place would dim them all). Per-object highlighting (e.g. the
     * SPP editor dimming the cells that aren't open) stays local via the same
     * clone-on-write isolation as updateObjectAppearance.
     */
    public setObjectOpacityIsolated(handle: RenderHandle, opacity: number): void {
        (handle as THREE.Object3D).traverse((child) => {
            if (!(child instanceof THREE.Mesh) || !child.material) return;
            const mat = isolateMaterial(child as THREE.Mesh);
            mat.opacity = opacity;
            mat.transparent = opacity < 1.0;
        });
    }

    /**
     * Clone-on-write a mesh's material the first time it's overridden, so a
     * per-object appearance change never bleeds across the meshes that share one
     * cached MeshFactory material. The clone is marked owned (userData.shared =
     * false — Material.clone deep-copies userData, which would otherwise carry the
     * cached material's shared=true and skip disposal), so it's freed with the
     * mesh (disposeMeshResources) instead of leaking.
     */
    /** Animated texture scroll: set the material map's UV offset (type 'texture').
     *  Enables RepeatWrapping so the offset wraps instead of clamping. */
    public setTextureOffset(handle: RenderHandle, u: number, v: number): void {
        (handle as THREE.Object3D).traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const mat = child.material as THREE.MeshStandardMaterial;
                if (mat.map) {
                    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
                    mat.map.offset.set(u, v);
                }
            }
        });
    }

    /** Drive morph-target (blendshape) influences on a loaded model (type 'morph').
     *  No-op on primitives, which have no morph attributes. */
    public setMorphInfluences(handle: RenderHandle, influences: number[]): void {
        (handle as THREE.Object3D).traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && mesh.morphTargetInfluences) {
                const n = Math.min(influences.length, mesh.morphTargetInfluences.length);
                for (let i = 0; i < n; i++) mesh.morphTargetInfluences[i] = influences[i];
            }
        });
    }

    public add(object: THREE.Object3D): void {
        // World content (e.g. loaded models posed each frame) → worldRoot so the
        // floating origin applies.
        this.worldRoot.add(object);
    }

    public remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    public clearScene(): void {
        // World content all hangs off worldRoot — clear its direct children (lights
        // and cameras live on the scene and are preserved).
        const toRemove = [...this.worldRoot.children];
        for (const child of toRemove) {
            this.worldRoot.remove(child);
            // Same shared-resource guard as removeHandle (don't dispose cached/shared).
            disposeMeshResources(child);
        }
    }

    /**
     * Lighting API — delegated to render/SceneLighting.
     */
    public setAmbientLight(color: number, intensity: number): RenderHandle {
        return this.lighting.setAmbient(color, intensity);
    }

    public setFog(near: number, far: number, color?: number): void {
        this.lighting.setFog(near, far, color);
    }

    public setDirectionalLight(color: number, intensity: number, x: number, y: number, z: number): RenderHandle {
        return this.lighting.setDirectional(color, intensity, x, y, z);
    }

    public setHemisphereLight(skyColor: number, groundColor: number, intensity: number): RenderHandle {
        return this.lighting.setHemisphere(skyColor, groundColor, intensity);
    }

    public updateAmbientLight(light: RenderHandle, color: number, intensity: number): void {
        this.lighting.updateAmbient(light, color, intensity);
    }

    public updateDirectionalLight(light: RenderHandle, color: number, intensity: number, x: number, y: number, z: number): void {
        this.lighting.updateDirectional(light, color, intensity, x, y, z);
    }

    /**
     * If the main camera has strayed past the floating-origin's rebase threshold,
     * re-base the origin onto it (render/FloatingOrigin) and re-derive whatever
     * ELSE is expressed in render-space that FloatingOrigin doesn't own: the main
     * camera position and the minimap pass.
     */
    private maybeRebaseOrigin(): void {
        if (!this.floatingOrigin.maybeRebase(this._cameraAbs)) return;
        this.mainCamera.position.set(this._cameraAbs.x - this.renderOrigin.x, this._cameraAbs.y - this.renderOrigin.y, this._cameraAbs.z - this.renderOrigin.z);
        this.minimap.rebase(this.renderOrigin);
    }

    /**
     * Rendering Logic
     */
    public render(isMinimapActive: boolean): void {
        if (this._contextLost) return; // context dead — resume on 'webglcontextrestored'
        this.stats?.begin();
        this.maybeRebaseOrigin();
        this.lighting.anchorSunShadow(this.mainCamera.position);
        // Label proximity gate (view-only): re-evaluate every 10 frames — walking
        // speed vs a 3 m fade band makes per-frame checks pointless.
        if ((this._frameCount++ % 10) === 0) {
            this.media.updateLabels(this.mainCamera.position, this.scene);
        }
        if (!isMinimapActive) {
            this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
            this.renderer.setScissorTest(false);
            this.renderer.render(this.scene, this.mainCamera);
        } else {
            // Main pass
            this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
            this.renderer.setScissorTest(false);
            this.renderer.render(this.scene, this.mainCamera);

            // PiP Minimap pass (render/MinimapPass)
            this.minimap.render(this.renderer, this.scene, this.container);
        }
        this.stats?.end();
    }

    /**
     * Flip the sun's shadow map at runtime — the A/B switch for "how much does
     * this cost and does it look right?".
     *
     * Three compiles one program per material and bakes `shadowMap.enabled` into
     * it, so an existing material keeps rendering unshadowed until it is flagged
     * for recompile — hence the traversal. That makes the flip itself expensive
     * (a shader rebuild for every live material); it is a debug/settings action,
     * not something to drive per frame.
     */
    public setShadowsEnabled(on: boolean): void {
        if (this.renderer.shadowMap.enabled === on) return;
        this.renderer.shadowMap.enabled = on;
        this.renderer.shadowMap.needsUpdate = true;
        this.scene.traverse((o: any) => {
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x: any) => { if (x) x.needsUpdate = true; });
            else if (m) m.needsUpdate = true;
        });
    }

    public getShadowsEnabled(): boolean { return this.renderer.shadowMap.enabled; }

    /** Per-frame GPU work from the last render + resident resources (debug HUD).
     *  `calls` roughly doubles with shadows on: the sun's depth pass re-draws
     *  every caster before the beauty pass. */
    public perfInfo(): { calls: number; triangles: number; lines: number; points: number; geometries: number; textures: number; programs: number; shadows: boolean } {
        const info = this.renderer.info;
        return {
            calls: info.render.calls,
            triangles: info.render.triangles,
            lines: info.render.lines,
            points: info.render.points,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            programs: info.programs?.length ?? 0,
            shadows: this.renderer.shadowMap.enabled,
        };
    }

    public getDomElement(): HTMLElement {
        return this.container;
    }

    public resize(): void {
        // Clamp to a sane max: a broken flex layout can report an absurd
        // clientHeight (e.g. 2^25), which would allocate a monstrous canvas and
        // collapse the aspect to ~0. Cap at the WebGL max render buffer.
        const MAX = 8192;
        const width = Math.min(this.container.clientWidth, MAX);
        const height = Math.min(this.container.clientHeight, MAX);
        if (width <= 0 || height <= 0) return;

        this.mainCamera.aspect = width / height;
        this.mainCamera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Specialized Visual Helpers
     */
    public createAvatarMesh(): RenderHandle {
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshStandardMaterial({
            color: 0x3366ff,
            transparent: true,
            opacity: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0.9, 0); // Position it so feet are at origin
        mesh.raycast = () => { }; // Ignore for raycasting
        this.worldRoot.add(mesh);
        return mesh;
    }

    public createMinimapMarker(): THREE.Mesh {
        const geometry = new THREE.ConeGeometry(3, 8, 3);
        geometry.translate(0, 4, 0);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 999;
        mesh.position.y = 100;

        this.worldRoot.add(mesh);
        return mesh;
    }

    // ── Editor helper visuals — delegated to render/EditorHelpers ──────────────
    public createSelectionHighlight(target: RenderHandle, color: number = 0x00ffff): RenderHandle {
        return this.editorHelpers.selectionHighlight(target, color);
    }

    public createBlockHighlight(parent: RenderHandle, bw: number, bl: number, bh: number): RenderHandle {
        return this.editorHelpers.blockHighlight(parent, bw, bl, bh);
    }

    public createGridHelper(size: number, divisions: number, _color1: number = 0x444444, color2: number = 0x888888): RenderHandle {
        return this.editorHelpers.gridHelper(size, divisions, color2);
    }

    // ── Edit-mode translate gizmo — delegated to render/TransformGizmo ─────────
    private gizmo: TransformGizmo | null = null;

    /** Attach the 3DMax-style XYZ drag gizmo to a mesh handle (edit selection).
     *  Lazily constructs the TransformControls wrapper on first use. */
    public attachTransformGizmo(target: RenderHandle, hooks: GizmoHooks): void {
        this.gizmo ??= new TransformGizmo(
            this.scene, this.mainCamera, this.renderer.domElement, this.floatingOrigin.origin);
        this.gizmo.attach(target, hooks);
    }

    public detachTransformGizmo(): void {
        this.gizmo?.detach();
    }

    /** True while a gizmo axis is grabbed or hovered — the click belongs to the
     *  gizmo, not to select/deselect raycasting (EditSystem gates on this). */
    public isGizmoBusy(): boolean {
        return this.gizmo?.busy ?? false;
    }

    public gizmoInfo(): GizmoInfo {
        return this.gizmo?.info() ?? { attached: false, dragging: false, axis: null };
    }

    /**
     * Helper API
     */
    public updateBlockHighlight(handle: RenderHandle, bx: number, by: number, bw: number, bl: number, bh: number, elevation: number = 0) {
        // BX/BY are SPP 1-based coordinates. 
        // worldX = (bx - 1) * bw
        // worldZ = -(by - 1) * bl
        // Highlighting is centered in the block volume
        const x = (bx - 1) * bw + bw / 2;
        const z = -((by - 1) * bl + bl / 2);
        const y = elevation + bh / 2;
        this.setObjectPosition(handle, x, y, z);
    }

    /**
     * Interaction API — delegated to render/Picking.
     */
    public castRayFromCamera(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        return this.picking.castRay(this.mainCamera, ndcX, ndcY);
    }

    public castRayFromMinimap(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        return this.picking.castRay(this.minimap.cameraInstance, ndcX, ndcY);
    }

    /**
     * Projects a ray from the camera and intersects it with a mathematical plane.
     */
    public intersectRayWithPlane(ndcX: number, ndcY: number, planeNormal: [number, number, number], planePoint: [number, number, number]): [number, number, number] | null {
        return this.picking.intersectRayWithPlane(this.mainCamera, ndcX, ndcY, planeNormal, planePoint);
    }

    /**
     * Projects a 3D world point to 2D screen coordinates (Normalized 0-1 range)
     */
    public worldToScreen(x: number, y: number, z: number): { x: number, y: number } {
        return this.picking.worldToScreen(this.mainCamera, x, y, z);
    }

    // ── Particle effects (weather sheet + bursts) — delegated to render/ParticleFX ─
    public createWeatherParticles(): RenderHandle { return this.particles.createWeather(); }

    public updateWeatherParticles(points: RenderHandle, x: number, y: number, z: number, visible: boolean): void {
        this.particles.updateWeather(points, x, y, z, visible);
    }

    public createParticleBurst(particleCount: number, color: number): { handle: RenderHandle, velocities: Float32Array } {
        return this.particles.createBurst(particleCount, color);
    }

    public updateParticleBurst(handle: RenderHandle, dt: number, velocities: Float32Array, opacity: number): void {
        this.particles.updateBurst(handle, dt, velocities, opacity);
    }

    public getObjectByEntityId(id: string | number): RenderHandle | null {
        return this._entityObjectIndex.get(id) ?? null;
    }

    public lockControls(): void {
        // Implementation depends on the control scheme used (e.g. PointerLock)
        // This is a hook for external systems to trigger locking
    }

    public unlockControls(): void {
    }

    // ── Audio (3D spatial) — delegated to render/SpatialAudio ─────────────────
    private audio!: SpatialAudio;

    /** Play a one-shot sound (positional if given a point, else flat 2D). */
    public playSpatialSound(url: string, position: [number, number, number] | null, volume: number = 1): void {
        this.audio.play(url, position, volume);
    }

    // ── A/V media adjuncts (e2 audio emitter / e3 video screen) ────────────────
    // The <video>/PositionalAudio live ON the mesh handle (userData.__media) so
    // removeHandle stops + frees them on block eviction. See specs/av-media-adjuncts.md.

    /** Attach a looping spatial sound to a mesh (audio emitter, e2). */
    public attachAudioEmitter(
        handle: RenderHandle,
        url: string,
        opts: { autoplay?: boolean; loop?: boolean; volume?: number; refDistance?: number } = {},
    ): void {
        this.audio.attachEmitter(handle, url, opts);
    }

    /**
     * Attach a live VideoTexture to a mesh's material (video screen, e3). Streams a
     * `<video>` → THREE.VideoTexture (auto-updates each render) → material.map, on a
     * clone-on-write material so it never bleeds onto shared cached mats. Muted by
     * default (browsers block autoplay-with-sound before a user gesture). Headless
     * (no DOM) → no-op. See spec §4.
     */
    public attachVideoScreen(
        handle: RenderHandle,
        url: string,
        opts: { autoplay?: boolean; loop?: boolean; muted?: boolean; volume?: number } = {},
    ): void {
        this.media.attachVideo(handle, url, opts);
    }

    // ── Skeletal animation — delegated to render/AvatarAnimator ───────────────
    public startAnimation(handle: RenderHandle, clips: THREE.AnimationClip[]): void { this.animator.start(handle, clips); }
    public setAnimationState(handle: RenderHandle, state: string, fadeSec = 0.25): void { this.animator.setState(handle, state, fadeSec); }
    public updateAnimation(handle: RenderHandle, dt: number): void { this.animator.update(handle, dt); }
    public stopAnimation(handle: RenderHandle): void { this.animator.stop(handle); }
    public getAnimationDebug(handle: RenderHandle) { return this.animator.debug(handle); }

    public removeHandle(handle: RenderHandle): void {
        const obj = handle as THREE.Object3D;

        // Liveness flag for async swaps: an in-flight model load checks this on
        // the meshGroup before instancing, so it never adds a clone to a disposed
        // group (the placeholder-then-swap eviction race).
        if (obj.userData) obj.userData.__removed = true;

        this.stopAnimation(handle);

        // Correctly remove from whatever parent it has (Scene or Group)
        if (obj.parent) {
            obj.parent.remove(obj);
        }

        // Remove from entityId index if applicable
        if (obj.userData && obj.userData.entityId !== undefined) {
            this._entityObjectIndex.delete(obj.userData.entityId);
        }

        // Recursive disposal, guarded against shared resources (see render/HandleDisposal).
        obj.traverse((child) => {
            disposeMediaResources(child);   // stop <video>/PositionalAudio first
            disposeMeshResources(child);
            if ((child as any).isSprite) {               // floating label (attachLabel)
                const m = (child as THREE.Sprite).material as THREE.SpriteMaterial;
                m?.map?.dispose(); m?.dispose();
            }
        });
    }

    /** Floating billboard title label for interactive panel adjuncts (render/MediaScreens). */
    public attachLabel(handle: RenderHandle, text: string, heightOffset = 1.0): void {
        this.media.attachLabel(handle, text, heightOffset);
    }

    public dispose(): void {
        this.gizmo?.dispose();
        this.gizmo = null;
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
        // Full teardown of the process-wide mesh caches. Fine for the single-
        // engine client; a second live engine in the same process would lose its
        // cache (it would rebuild lazily) — acceptable, tests use NullRenderEngine.
        MeshFactory.clearCache();
        this.renderer.dispose();
    }
}
