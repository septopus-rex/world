import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

// The SPP Animation Protocol end-to-end through the render-sync boundary.
// AnimationSystem computes per-frame overrides onto the AnimationComponent and
// marks the transform dirty; VisualSyncSystem is the single place that pushes
// them onto the render handle. Before this batch, opacity/color overrides were
// computed but NEVER applied (no consumer) — a silent no-op; texture/morph
// didn't exist. The NullRenderEngine records the calls so the wiring is testable.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

/** A free-standing animated entity (Transform + Mesh + Animation) — no block,
 *  no adjunct, so only Animation/VisualSync touch it. */
function spawnAnimated(world: any, timeline: any[], duration = 1000) {
    const eid = world.createEntity();
    const handle = world.renderEngine.createAvatarMesh();
    world.addComponent(eid, 'TransformComponent', { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dirty: true });
    world.addComponent(eid, 'MeshComponent', { handle, visible: true });
    world.addComponent(eid, 'AnimationComponent', {
        config: { duration, loops: 0, timeline },
        elapsedTime: 0, isPaused: false, loopCount: 0,
    });
    return eid;
}

describe('SPP animation protocol → render boundary', () => {
    it('color + opacity overrides actually reach the handle (was a dormant no-op)', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        spawnAnimated(world, [
            { time: [0, 1000], type: 'color', mode: 'set', value: [0xff0000, 0x00ff00] },
            { time: [0, 1000], type: 'opacity', mode: 'set', value: 0.5 },
        ]);

        engine.step(1 / 60);

        expect(nullEngine.__counts.lastAppearance).not.toBeNull();
        expect(nullEngine.__counts.lastAppearance!.opacity).toBeCloseTo(0.5, 3);
        expect(nullEngine.__counts.lastAppearance!.color).toBeTypeOf('number');
    });

    it('texture/UV scroll reaches the handle and accumulates in add mode', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        // add mode: per-frame delta scaled by dt/duration → UV drifts up each frame.
        spawnAnimated(world, [{ time: [0, 1000], type: 'texture', axis: 'X', mode: 'add', value: 1.0 }]);

        engine.step(1 / 60);
        const first = nullEngine.__counts.lastUVOffset![0];
        expect(first).toBeGreaterThan(0);
        engine.step(1 / 60);
        expect(nullEngine.__counts.lastUVOffset![0]).toBeGreaterThan(first); // kept scrolling
    });

    it('morph-target influence reaches the handle (type morph)', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        spawnAnimated(world, [{ time: [0, 1000], type: 'morph', index: 1, mode: 'set', value: 0.8 }]);

        engine.step(1 / 60);

        expect(nullEngine.__counts.lastMorph).not.toBeNull();
        expect(nullEngine.__counts.lastMorph![1]).toBeCloseTo(0.8, 3);
    });
});
