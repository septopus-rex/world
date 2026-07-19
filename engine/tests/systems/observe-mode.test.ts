import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { CharacterController } from '../../src/core/movement/CharacterController';

// Observe mode: player control is suspended and the camera orbits the target —
// drag rotates, W/S zooms, the camera always faces the target. The standalone
// successor to the old engine's separate "observe" renderer + OrbitControls.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function injectGround(engine: any) {
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
    stepN(engine, 30);
}

const dist = (a: number[], b: number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('observe mode (orbit camera)', () => {
    it('orbits at a fixed radius and always faces the target; player is frozen', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        injectGround(engine);
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const trans = world.getComponent<any>(player, 'TransformComponent');

        engine.setMode(SystemMode.Observe);
        engine.step(1 / 60);

        // Orbit anchor = 1 m above the body CENTRE. Transform-relative on purpose
        // (unlike the feet-anchored eye) — the orbiting tools are framed against it.
        const target = [trans.position[0], trans.position[1] + 1, trans.position[2]];
        const cam = nullEngine.__counts.lastCameraPos!;
        expect(dist(cam, target)).toBeCloseTo(8, 1);                   // default radius
        expect(nullEngine.__counts.lastCameraLookAt).toEqual(target);  // faces the target

        // Player does not move while observing.
        const frozen = [...trans.position];
        stepN(engine, 30);
        expect([...trans.position]).toEqual(frozen);
    });

    it('mouse drag rotates the orbit around the target', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        injectGround(engine);
        const cc = world.systems.findSystem(CharacterController)!;
        const ip = (cc as any).inputProvider;

        engine.setMode(SystemMode.Observe);
        engine.step(1 / 60);
        const az0 = cc.getObserveState().azimuth;
        const cam0 = [...nullEngine.__counts.lastCameraPos!];

        ip.mouseDeltaX = 80;            // drag horizontally → azimuth changes
        engine.step(1 / 60);

        expect(cc.getObserveState().azimuth).not.toBeCloseTo(az0, 5);
        expect(dist(nullEngine.__counts.lastCameraPos!, cam0)).toBeGreaterThan(0.1); // camera swung around
    });

    it('W zooms the orbit in', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        injectGround(engine);
        const cc = world.systems.findSystem(CharacterController)!;
        const ip = (cc as any).inputProvider;

        engine.setMode(SystemMode.Observe);
        engine.step(1 / 60);
        const r0 = cc.getObserveState().radius;

        ip.keys.add('KeyW');            // hold forward → zoom in
        stepN(engine, 20);
        expect(cc.getObserveState().radius).toBeLessThan(r0);
    });
});
