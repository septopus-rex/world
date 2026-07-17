import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, makeHeadlessEngineWith } from '../helpers/make-world';
import { FakeModelLoader, makeRiggedTemplate, flushAsync } from '../helpers/fake-resources';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { EntityFactory } from '../../src/core/EntityFactory';

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

describe('avatar — declared visual physique (player.md §3)', () => {
    // The rigged fake template's bbox is 2 m tall (BoxGeometry 1×2×1), so the
    // scale factor k = declaredHeight / 2 is exact — no live-Box3 flakiness.
    it('声明身高驱动模型缩放,落地时相机眼高跟随;物理胶囊留在世界基线', async () => {
        const loader = new FakeModelLoader(makeRiggedTemplate);
        const ds: any = {
            async world() {
                const c = JSON.parse(JSON.stringify(MockWorldNormal));
                c.player.avatar.resource = 34;
                c.player.avatar.physique = { height: 2.2, eyeHeight: 2.0 };
                return c;
            },
            async view() { return null; },
            async module(ids: number[]) {
                const out: any = {};
                for (const id of ids) out[id] = { type: 'avatar', format: 'glb', raw: `models/a${id}.glb` };
                return out;
            },
            async texture() { return {}; },
        };
        const { engine } = await makeHeadlessEngineWith({ api: ds, resources: { loader } });
        await flushAsync();
        const world = engine.getWorld()!;
        const player = world.getEntitiesWith(['AvatarComponent'])[0];
        const av = world.getComponent<any>(player, 'AvatarComponent');
        const cam = world.getComponent<any>(player, 'CameraComponent');
        const rb = world.getComponent<any>(player, 'RigidBodyComponent');

        expect(av.handle.scale.x, '模型缩放到声明身高 2.2 (源 2m → k=1.1)').toBeCloseTo(1.1, 5);
        expect(cam.offset[1], '模型落地时相机骑上声明眼高').toBeCloseTo(2.0, 5);
        expect(rb.size[1], '碰撞胶囊不read声明——留在世界基线 1.8').toBeCloseTo(1.8, 5);

        // Swap to an avatar with NO declaration → visual body resets to baseline.
        EntityFactory.swapAvatar(world, '30');
        await flushAsync();
        const av2 = world.getComponent<any>(player, 'AvatarComponent');
        expect(av2.resource).toBe('30');
        expect(av2.handle.scale.x, '未声明 → 缩回基线 1.8 (k=0.9)').toBeCloseTo(0.9, 5);
        expect(cam.offset[1], '未声明 → 眼高重置基线 1.7').toBeCloseTo(1.7, 5);

        // Swap with an EXTREME declaration → world clamp [0.5, 3] bites, and the
        // undeclared eye derives proportionally from the clamped height.
        EntityFactory.swapAvatar(world, '35', undefined, { height: 50 });
        await flushAsync();
        const av3 = world.getComponent<any>(player, 'AvatarComponent');
        expect(av3.handle.scale.x, '声明 50m 被夹到 3m (k=1.5)').toBeCloseTo(1.5, 5);
        expect(cam.offset[1], '眼高按夹后身高比例推导').toBeCloseTo(3 * (1.7 / 1.8), 5);
        expect(rb.size[1], '物理始终不动').toBeCloseTo(1.8, 5);
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
