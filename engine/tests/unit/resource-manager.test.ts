import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ResourceManager } from '../../src/render/ResourceManager';
import { IpfsRouter } from '../../src/core/services/ipfs/IpfsRouter';
import { MemoryCasProvider } from '../../src/core/services/ipfs/MemoryCasProvider';
import {
    FakeModelLoader,
    FakeTextureLoader,
    CountingDataSource,
    makePlainTemplate,
    makeRiggedTemplate,
} from '../helpers/fake-resources';

// The user's core requirement: "网络拉取的原始文件，要独立保存，例如，一个机器人的
// 模型，在3D里可能显示多个的，但是模型文件只有一个。类似的，还有材质。"
//   → one raw file per resource id; many instances; one decode in memory.

const modRec = (format = 'glb', raw = 'models/robot.glb') => ({ type: 'module', format, raw });

function makeRM(opts: { factory?: () => THREE.Object3D } = {}) {
    const loader = new FakeModelLoader(opts.factory);
    const texLoader = new FakeTextureLoader();
    const ds = new CountingDataSource(
        { '27': modRec(), '31': modRec('glb', 'models/tree.glb') },
        { '7': { type: 'texture', format: 'jpg', raw: 'textures/water.jpg', repeat: [2, 2] } }
    );
    const rm = new ResourceManager(ds as any, { loader, textureLoader: texLoader });
    return { rm, loader, texLoader, ds };
}

describe('ResourceManager — load-once-by-id (model dedup)', () => {
    it('a burst of concurrent getModel() for one id fetches + decodes EXACTLY ONCE', async () => {
        const { rm, loader, ds } = makeRM();

        // 50 concurrent requests for the same id in one "frame".
        const entries = await Promise.all(Array.from({ length: 50 }, () => rm.getModel('27')));

        expect(ds.moduleCalls['27'], 'datasource fetched id 27 once').toBe(1);
        expect(loader.parseCount, 'model decoded once').toBe(1);
        // All callers got the SAME cached entry (same template object).
        const template = entries[0].template;
        expect(entries.every(e => e.template === template)).toBe(true);
    });

    it('caches per id: two distinct ids load independently, each once', async () => {
        const { rm, loader, ds } = makeRM();
        await Promise.all([rm.getModel('27'), rm.getModel('31'), rm.getModel('27')]);
        expect(ds.moduleCalls['27']).toBe(1);
        expect(ds.moduleCalls['31']).toBe(1);
        expect(loader.parseCount).toBe(2);
    });
});

describe('ResourceManager — instance-many (one file, many clones)', () => {
    it('instances share the template geometry/material by reference; refCount tracks clones', async () => {
        const { rm } = makeRM();
        const entry = await rm.getModel('27');
        const templateMesh = entry.template.children[0] as THREE.Mesh;

        const clones = Array.from({ length: 50 }, () => rm.instance('27'));

        // 50 distinct node trees ...
        expect(new Set(clones).size).toBe(50);
        // ... but every clone's mesh shares the ONE template geometry + material.
        for (const c of clones) {
            const m = c.children[0] as THREE.Mesh;
            expect(m).not.toBe(templateMesh);              // new node
            expect(m.geometry).toBe(templateMesh.geometry); // shared geometry (1 in memory)
            expect(m.material).toBe(templateMesh.material); // shared material
            expect(m.userData.shared).toBe(true);           // disposal guard marker
        }
        expect(rm.getModelEntry('27')!.refCount).toBe(50);
    });

    it('detects rigged templates and clones them with independent skeletons', async () => {
        const { rm } = makeRM({ factory: makeRiggedTemplate });
        const entry = await rm.getModel('27');
        expect(entry.rigged).toBe(true);

        const a = rm.instance('27');
        const b = rm.instance('27');
        const skinnedA = a.getObjectByProperty('isSkinnedMesh', true as any) as THREE.SkinnedMesh;
        const skinnedB = b.getObjectByProperty('isSkinnedMesh', true as any) as THREE.SkinnedMesh;
        expect(skinnedA).toBeDefined();
        expect(skinnedB).toBeDefined();
        // SkeletonUtils.clone gives each clone its OWN skeleton (independent posing),
        // while geometry is still shared.
        expect(skinnedA.skeleton).not.toBe(skinnedB.skeleton);
        expect(skinnedA.geometry).toBe(skinnedB.geometry);
    });
});

describe('ResourceManager — ref-counted release (memory stays bounded)', () => {
    it('disposes the shared template only when the LAST clone is released', async () => {
        const { rm } = makeRM();
        await rm.getModel('27');
        const c1 = rm.instance('27');
        const c2 = rm.instance('27');
        const templateMesh = rm.getModelEntry('27')!.template.children[0] as THREE.Mesh;

        // Track whether the shared geometry gets disposed.
        let disposed = false;
        templateMesh.geometry.addEventListener?.('dispose', () => { disposed = true; });

        rm.release('27');
        expect(rm.getModelEntry('27')!.refCount).toBe(1);
        expect(disposed, 'template alive while a clone remains').toBe(false);

        rm.release('27');
        expect(rm.getModelEntry('27'), 'entry dropped at refCount 0').toBeUndefined();
        expect(disposed, 'template geometry disposed at refCount 0').toBe(true);
        // The cache is clear: re-requesting reloads.
        expect(rm.getStats().models).toBe(0);
    });

    it('a failed load is not cached (a later request retries)', async () => {
        const ds = new CountingDataSource({}, {}); // no record for id 99 -> getModel rejects
        const rm = new ResourceManager(ds as any, { loader: new FakeModelLoader() });
        await expect(rm.getModel('99')).rejects.toThrow();
        await expect(rm.getModel('99')).rejects.toThrow();
        expect(ds.moduleCalls['99']).toBe(2); // retried, not stuck on a poisoned cache entry
    });
});

describe('ResourceManager — content-addressed model (`<cid>.<ext>`)', () => {
    it('routes bytes through the CAS router; the suffix gives the format, the stem stays the src', async () => {
        const router = new IpfsRouter([new MemoryCasProvider()]);
        const cid = await router.put(new TextEncoder().encode('fake-splat-bytes'));

        const calls: Array<{ format: string; url: string }> = [];
        const loader = { parse: async (format: string, url: string) => { calls.push({ format, url }); return makePlainTemplate(); } };
        const ds = new CountingDataSource({}, {});
        const rm = new ResourceManager(ds as any, { loader: loader as any, ipfsRouter: router });

        const entry = await rm.getModel(`${cid}.spz`);
        expect(calls[0].format, 'format from the filename-style suffix').toBe('spz');
        expect(calls[0].url, 'bytes came via the router, not a direct fetch of the id').toMatch(/^(blob:|data:)/);
        // src is the BARE cid — release() only revokes router object-URLs for
        // isCid(src), so keeping the suffix there would leak the blob.
        expect(entry.src).toBe(cid);
        expect(Object.keys(ds.moduleCalls).length, 'no datasource id lookup').toBe(0);
    });

    it('a bare CID is rejected with guidance — a model must know its format up front', async () => {
        const router = new IpfsRouter([new MemoryCasProvider()]);
        const cid = await router.put(new TextEncoder().encode('some-bytes'));
        const rm = new ResourceManager(new CountingDataSource({}, {}) as any, { loader: new FakeModelLoader(), ipfsRouter: router });
        await expect(rm.getModel(cid)).rejects.toThrow(/bare CID/);
    });
});

describe('ResourceManager — texture dedup (shared by reference)', () => {
    it('a burst of getTexture() for one id loads ONCE and returns the same Texture', async () => {
        const { rm, texLoader, ds } = makeRM();
        const texes = await Promise.all(Array.from({ length: 30 }, () => rm.getTexture('7')));
        expect(ds.textureCalls['7']).toBe(1);
        expect(texLoader.loadCount).toBe(1);
        const tex = texes[0];
        expect(texes.every(t => t === tex)).toBe(true);  // ONE Texture, referenced 30x
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    });

    it('applies anti-mosaic filtering: anisotropy + sRGB colorSpace + authored repeat', async () => {
        const ds = new CountingDataSource({}, { '7': { type: 'texture', format: 'jpg', raw: 'textures/wall.jpg', repeat: [3, 3] } });
        const rm = new ResourceManager(ds as any, { textureLoader: new FakeTextureLoader(), maxAnisotropy: 16 });
        const tex = await rm.getTexture('7');
        expect(tex.anisotropy).toBe(8);                       // capped at 8 (16 requested)
        expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);    // albedo gamma-correct
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
        expect(tex.wrapT).toBe(THREE.RepeatWrapping);
        expect([tex.repeat.x, tex.repeat.y]).toEqual([3, 3]); // authored repeat (atop UV tiling)
    });

    it('honors a lower anisotropy cap and a linear (non-sRGB) data texture', async () => {
        const ds = new CountingDataSource({}, { '7': { type: 'texture', format: 'png', raw: 'data/normal.png' } });
        const rm = new ResourceManager(ds as any, { textureLoader: new FakeTextureLoader(), maxAnisotropy: 4 });
        const tex = await rm.getTexture('7', undefined, { srgb: false });
        expect(tex.anisotropy).toBe(4);
        expect(tex.colorSpace).not.toBe(THREE.SRGBColorSpace);
    });

    it('releaseTexture disposes only when the last user is gone', async () => {
        const { rm } = makeRM();
        const tex = await rm.getTexture('7');
        let disposed = false;
        tex.addEventListener?.('dispose', () => { disposed = true; });
        rm.retainTexture('7'); rm.retainTexture('7');
        rm.releaseTexture('7');
        expect(disposed).toBe(false);
        rm.releaseTexture('7');
        expect(disposed).toBe(true);
        expect(rm.getStats().textures).toBe(0);
    });
});
