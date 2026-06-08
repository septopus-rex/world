import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, makeHeadlessEngineWith } from '../helpers/make-world';
import { FakeModelLoader, makeRiggedTemplate, flushAsync } from '../helpers/fake-resources';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

// The player avatar is just a model resource (IPFS-fetchable) loaded via the SAME
// ResourceManager pipeline as module adjuncts: placeholder box now, swap to the
// loaded (rigged) model when it resolves, scaled to body height. Plus a first/
// third-person camera toggle so the avatar is actually visible.

describe('avatar — model resource via ResourceManager', () => {
    it('loads the configured avatar once and swaps the placeholder for the model', async () => {
        const loader = new FakeModelLoader(makeRiggedTemplate); // rigged → SkeletonUtils path
        const ds: any = {
            moduleCalls: {} as Record<string, number>,
            async world() {
                const c = JSON.parse(JSON.stringify(MockWorldNormal));
                c.player.avatar.resource = 30;
                return c;
            },
            async view() { return null; },
            async module(ids: number[]) {
                const out: any = {};
                for (const id of ids) {
                    ds.moduleCalls[id] = (ds.moduleCalls[id] ?? 0) + 1;
                    if (id === 30) out[id] = { type: 'avatar', format: 'glb', raw: 'models/avatar.glb' };
                }
                return out;
            },
            async texture() { return {}; },
        };

        const { engine } = await makeHeadlessEngineWith({ api: ds, resources: { loader } });
        await flushAsync();
        const world = engine.getWorld()!;

        expect(ds.moduleCalls[30], 'avatar fetched once').toBe(1);
        expect(loader.parseCount, 'avatar decoded once').toBe(1);
        // Instanced exactly once into the avatar (load-once / instance-many, dedup-ready).
        expect(world.resourceManager.getStats().modelRefs['30']).toBe(1);

        // The AvatarComponent.handle is now the loaded model (a THREE object), not the
        // placeholder stub — i.e. the swap happened.
        const avId = world.getEntitiesWith(['AvatarComponent'])[0];
        const av = world.getComponent<any>(avId, 'AvatarComponent');
        expect(av.resource).toBe('30');
        expect(av.handle?.isObject3D, 'placeholder swapped for the model').toBe(true);
    });

    it('keeps the placeholder if no avatar resource is configured (headless default)', async () => {
        const engine = await makeHeadlessEngine(); // MockWorldNormal has no avatar.resource
        const world = engine.getWorld()!;
        const avId = world.getEntitiesWith(['AvatarComponent'])[0];
        const av = world.getComponent<any>(avId, 'AvatarComponent');
        expect(av.resource).toBeUndefined();
        expect(av.handle).toBeTruthy(); // placeholder still there
    });
});

describe('camera — first/third-person toggle', () => {
    it('defaults to third-person and toggles via Engine', async () => {
        const engine = await makeHeadlessEngine();
        const cc = engine.getWorld()!.systems.findSystemByName('CharacterController') as any;
        expect(cc.getViewMode()).toBe('third');         // so the avatar is visible by default
        engine.setCameraView('first');
        expect(cc.getViewMode()).toBe('first');
        expect(engine.toggleCameraView()).toBe('third');
        expect(cc.getViewMode()).toBe('third');
        // Stepping in either view runs headlessly without throwing.
        expect(() => engine.step(1 / 60)).not.toThrow();
    });
});
