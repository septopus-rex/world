import * as THREE from 'three';
import { SplatLoader, SplatMesh, PackedSplats } from '@sparkjsdev/spark';
import { ResourceError, attempt } from '../../core/errors';

/**
 * ModelLoader — async, format-dispatching loader that turns a fetched 3D-model
 * file into ONE reusable THREE.Object3D *template*.
 *
 * TypeScript port of the legacy engine's three/basic/loader.js router (which
 * lazily kept one loader instance per format). It replaces the old callback +
 * `setTimeout(1000)` timing hack with a real awaited promise.
 *
 * The template returned here is NOT placed in the scene directly — the
 * ResourceManager caches it once per resource id and hands out cheap clones
 * (one decoded file in memory → many instances). See ResourceManager.
 *
 * Format coverage mirrors the old engine's reality, not its advertising: the old
 * loader.js router only wired fbx/obj/gltf/3mf even though resource records
 * claimed 3DS/DAE/MMD. Here GLTF/GLB/FBX/OBJ are first-class; DAE(Collada) and
 * 3MF are best-effort; 3DS/MMD reject explicitly rather than failing silently.
 */
export interface IModelLoader {
    /** Parse an already-resolved loadable URL into a template Object3D. */
    parse(format: string, url: string): Promise<THREE.Object3D>;
}

type ThreeLoader = { loadAsync(url: string): Promise<any> };

/** First-class formats — tested and supported. */
const FIRST_CLASS = new Set(['gltf', 'glb', 'fbx', 'obj']);
/** Best-effort formats — wired but not part of the stability gate. */
const BEST_EFFORT = new Set(['dae', 'mf', '3mf']);
/** Gaussian-splat formats — routed through Spark's SplatLoader instead of a
 *  Three.js mesh loader. See computeBounds/ResourceManager.instance for the
 *  matching special-casing (a SplatMesh is not a conventional Mesh/Group). */
const SPLAT_FORMATS = new Set(['ply', 'spz', 'splat', 'ksplat', 'sog']);

export class ModelLoader implements IModelLoader {
    /** One loader instance per format type, reused for every file (old `instances[type]`). */
    private loaders = new Map<string, ThreeLoader>();

    async parse(format: string, url: string): Promise<THREE.Object3D> {
        const fmt = (format || '').toLowerCase();

        if (SPLAT_FORMATS.has(fmt)) return this.parseSplat(url);

        if (!FIRST_CLASS.has(fmt) && !BEST_EFFORT.has(fmt)) {
            // 3ds / mmd / collada-variants etc.: the old engine advertised these
            // but never implemented them. Fail loudly so the caller keeps its
            // placeholder instead of silently rendering nothing.
            throw new ResourceError(`[ModelLoader] format not supported: '${format}'`, { code: 'RESOURCE_FORMAT', kind: 'model' });
        }

        const loader = await this.getLoader(fmt);
        const result = await loader.loadAsync(url);
        return this.normalize(fmt, result);
    }

    /**
     * Normalize a loader result to a single template Object3D.
     *   - GLTF/GLB return { scene, animations } → return scene, stash animations
     *     on userData (so an AnimationSystem can drive clones later; not driven
     *     this migration — load+position only).
     *   - FBX/OBJ/Collada/3MF return an Object3D (Group) directly.
     */
    private normalize(fmt: string, result: any): THREE.Object3D {
        if (fmt === 'gltf' || fmt === 'glb') {
            const scene: THREE.Object3D = result.scene ?? result.scenes?.[0];
            if (!scene) throw new ResourceError('[ModelLoader] GLTF result had no scene', { code: 'RESOURCE_FORMAT', kind: 'model' });
            scene.userData = { ...scene.userData, animations: result.animations ?? [] };
            return scene;
        }
        if (result && (result as THREE.Object3D).isObject3D) return result as THREE.Object3D;
        throw new ResourceError(`[ModelLoader] '${fmt}' loader returned a non-Object3D result`, { code: 'RESOURCE_FORMAT', kind: 'model' });
    }

    /**
     * Gaussian-splat load path (Spark). Decodes the file ONCE into a shared
     * PackedSplats, then wraps it in ONE SplatMesh so the rest of ResourceManager
     * can treat it like any other "template" — traversal (rigged-check, always
     * false), computeBounds (special-cased below), userData.animations (never
     * set, so it stays empty — correct, splats carry no clips).
     *
     * The template's own `.packedSplats` is what ResourceManager.instance()
     * re-wraps into a FRESH SplatMesh per placement (see its splat branch) —
     * SplatMesh has no working clone()/copy() (it doesn't override THREE's
     * default, which knows nothing about its Dyno/GPU-buffer internals), so
     * cloning the template directly would silently produce an empty object.
     * Re-constructing from the shared, already-decoded PackedSplats is Spark's
     * own intended reuse path (SplatLoader.parse() mirrors this) and is cheap —
     * no re-fetch, no re-decode, just new per-instance transform/generator state.
     */
    private async parseSplat(url: string): Promise<THREE.Object3D> {
        const packedSplats = await new SplatLoader().loadAsync(url);
        if (!(packedSplats instanceof PackedSplats)) {
            throw new ResourceError('[ModelLoader] ExtSplats (multi-file splat bundles) not supported', { code: 'RESOURCE_FORMAT', kind: 'model' });
        }
        const mesh = new SplatMesh({ packedSplats });
        await mesh.initialized;
        return mesh;
    }

    /**
     * Lazily instantiate (and cache) one loader per format. Dynamic import keeps
     * the heavy loader modules out of the initial bundle / module-eval graph
     * until a model of that format is actually requested.
     */
    private async getLoader(fmt: string): Promise<ThreeLoader> {
        const cached = this.loaders.get(fmt);
        if (cached) return cached;

        let loader: ThreeLoader;
        switch (fmt) {
            case 'gltf':
            case 'glb': {
                const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
                loader = new GLTFLoader() as unknown as ThreeLoader;
                break;
            }
            case 'fbx': {
                const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
                loader = new FBXLoader() as unknown as ThreeLoader;
                break;
            }
            case 'obj': {
                const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
                loader = new OBJLoader() as unknown as ThreeLoader;
                break;
            }
            case 'dae': {
                const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
                loader = new ColladaLoader() as unknown as ThreeLoader;
                break;
            }
            case 'mf':
            case '3mf': {
                const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
                loader = new ThreeMFLoader() as unknown as ThreeLoader;
                break;
            }
            default:
                throw new ResourceError(`[ModelLoader] no loader for format '${fmt}'`, { code: 'RESOURCE_FORMAT', kind: 'model' });
        }
        this.loaders.set(fmt, loader);
        return loader;
    }

    /**
     * Axis-aligned bounding box of a template. The old engine computed boundy()
     * but only console.logged it; here it's exposed so ResourceManager can scale
     * a clone to fit a desired authored size (std size triple).
     */
    static computeBounds(template: THREE.Object3D): THREE.Box3 {
        // A SplatMesh has no conventional BufferGeometry position attribute for
        // Box3.setFromObject's traversal to find (its splat centers live in a
        // Dyno/GPU-buffer graph, not scene-graph geometry) — it exposes its own
        // bounds method instead.
        if (template instanceof SplatMesh) {
            return attempt(
                { tag: '[ModelLoader]', severity: 'warn', code: 'RESOURCE_FORMAT', kind: 'model' },
                () => template.getBoundingBox(),
                new THREE.Box3(),
            );
        }
        // Some malformed/rigged geometries throw in setFromObject; bounds are
        // a sizing convenience, not a load gate — fall back to an empty box.
        // `attempt` reports (no longer silent) and returns the fallback.
        return attempt(
            { tag: '[ModelLoader]', severity: 'warn', code: 'RESOURCE_FORMAT', kind: 'model' },
            () => {
                // Ensure node transforms are current first — a model with a baked root
                // scale (common in glTF) would otherwise yield bounds in the wrong unit,
                // breaking scale-to-fit.
                template.updateMatrixWorld?.(true);
                return new THREE.Box3().setFromObject(template);
            },
            new THREE.Box3(),
        );
    }
}
