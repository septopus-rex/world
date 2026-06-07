import * as THREE from 'three';
import type { IModelLoader } from '../../src/render/loaders/ModelLoader';
import type { ITextureLoader } from '../../src/core/services/ResourceManager';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

/**
 * Test doubles for resource loading. They let the dedup tests prove "N instances
 * load the file ONCE" using REAL THREE clone semantics (so geometry-sharing and
 * SkeletonUtils.clone are genuinely exercised) without fighting node's lack of
 * file:// fetch — the heavy GLTF/FBX decode is replaced by a counted factory.
 */

/** Build a plain (non-rigged) template: a Group with one Mesh (box geo + standard mat). */
export function makePlainTemplate(): THREE.Object3D {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x44aa88 }));
    group.add(mesh);
    return group;
}

/** Build a rigged template: a SkinnedMesh with a small bone hierarchy + one clip. */
export function makeRiggedTemplate(): THREE.Object3D {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    const bone2 = new THREE.Bone();
    bone.add(bone2);
    const skeleton = new THREE.Skeleton([bone, bone2]);

    const geo = new THREE.BoxGeometry(1, 2, 1);
    // Real skinned meshes carry per-vertex skin bindings; without them THREE's
    // bounding-box / clone math throws. Bind every vertex to bone 0, weight 1.
    const n = geo.attributes.position.count;
    const idx = new Uint16Array(n * 4);
    const wgt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) wgt[i * 4] = 1;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));

    const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    skinned.add(bone);
    skinned.bind(skeleton);

    root.add(skinned);
    root.userData.animations = [new THREE.AnimationClip('idle', 1, [])];
    return root;
}

/** A model loader whose parse() returns a counted template (no file IO). */
export class FakeModelLoader implements IModelLoader {
    public parseCount = 0;
    public callsByUrl: string[] = [];
    constructor(private factory: () => THREE.Object3D = makePlainTemplate) {}

    async parse(_format: string, url: string): Promise<THREE.Object3D> {
        this.parseCount++;
        this.callsByUrl.push(url);
        // Resolve on a later microtask to mimic real async decoding.
        await Promise.resolve();
        return this.factory();
    }
}

/** A texture loader returning a fresh (counted) THREE.Texture — no Image decode. */
export class FakeTextureLoader implements ITextureLoader {
    public loadCount = 0;
    async loadAsync(_url: string): Promise<THREE.Texture> {
        this.loadCount++;
        await Promise.resolve();
        const tex = new THREE.Texture();
        return tex;
    }
}

/**
 * A data source with per-id fetch counters for module()/texture(). Records map
 * resource id -> { type, format, raw } (the shape the old API.module returned).
 */
export class CountingDataSource {
    public moduleCalls: Record<string, number> = {};
    public textureCalls: Record<string, number> = {};

    constructor(
        private moduleRecords: Record<string, any> = {},
        private textureRecords: Record<string, any> = {}
    ) {}

    async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
    async view() { return null; }

    async module(ids: number[]) {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const key = String(id);
            this.moduleCalls[key] = (this.moduleCalls[key] ?? 0) + 1;
            if (this.moduleRecords[key]) out[key] = this.moduleRecords[key];
        }
        return out;
    }

    async texture(ids: number[]) {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const key = String(id);
            this.textureCalls[key] = (this.textureCalls[key] ?? 0) + 1;
            if (this.textureRecords[key]) out[key] = this.textureRecords[key];
        }
        return out;
    }
}

/** Drain pending microtasks/timers so async loads + swaps settle before assertions. */
export async function flushAsync(rounds = 5): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}
