import * as THREE from 'three';

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

export class ModelLoader implements IModelLoader {
    /** One loader instance per format type, reused for every file (old `instances[type]`). */
    private loaders = new Map<string, ThreeLoader>();

    async parse(format: string, url: string): Promise<THREE.Object3D> {
        const fmt = (format || '').toLowerCase();

        if (!FIRST_CLASS.has(fmt) && !BEST_EFFORT.has(fmt)) {
            // 3ds / mmd / collada-variants etc.: the old engine advertised these
            // but never implemented them. Fail loudly so the caller keeps its
            // placeholder instead of silently rendering nothing.
            throw new Error(`[ModelLoader] format not supported: '${format}'`);
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
            if (!scene) throw new Error('[ModelLoader] GLTF result had no scene');
            scene.userData = { ...scene.userData, animations: result.animations ?? [] };
            return scene;
        }
        if (result && (result as THREE.Object3D).isObject3D) return result as THREE.Object3D;
        throw new Error(`[ModelLoader] '${fmt}' loader returned a non-Object3D result`);
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
                throw new Error(`[ModelLoader] no loader for format '${fmt}'`);
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
        try {
            // Ensure node transforms are current first — a model with a baked root
            // scale (common in glTF) would otherwise yield bounds in the wrong unit,
            // breaking scale-to-fit.
            template.updateMatrixWorld?.(true);
            return new THREE.Box3().setFromObject(template);
        } catch (err) {
            // Some malformed/rigged geometries throw in setFromObject; bounds are
            // a sizing convenience, not a load gate — fall back to an empty box.
            console.warn('[ModelLoader] computeBounds failed; using empty bounds.', (err as any)?.message ?? err);
            return new THREE.Box3();
        }
    }
}
