import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

/**
 * CameraRig — where the eye sits, and how it gets there.
 *
 * ① Anchor (protocol player.md §2/§3.1): `eyeHeight` is declared data measured
 *    **from the feet** (it is clamped to ≤ the avatar's height — an eye above the
 *    head is meaningless), while `TransformComponent.position` is the collision
 *    capsule's **centre**. Adding the eye height straight to the transform put the
 *    first-person camera half a body too high — a 1.8 m soldier's eyes sat at
 *    2.6 m. `utils/Body.feetY` is the one anchor.
 *
 * ② Transition: flipping first↔third moves the camera 4.5 m back and 1.2 m up at
 *    once. That used to be a cut (only the PITCH eased, via auto-level), which
 *    reads as a teleport. The dolly now ramps over VIEW_BLEND_SEC — with an
 *    `immediate` escape hatch for rigs that sample the very next frame.
 */

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

async function bootOnGround() {
    const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
    stepN(engine, 60);   // fall + land
    const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const trans = world.getComponent<any>(player, 'TransformComponent');
    const body = world.getComponent<any>(player, 'RigidBodyComponent');
    const cam = world.getComponent<any>(player, 'CameraComponent');
    const feet = trans.position[1] + body.offset[1] - body.size[1] / 2;
    const camPos = () => [...nullEngine.__counts.lastCameraPos!] as number[];
    return { engine, nullEngine, world, player, trans, body, cam, feet, camPos };
}

const SETTLE = 30;   // frames — comfortably past VIEW_BLEND_SEC (0.3 s = 18)

describe('camera eye height (feet-anchored)', () => {
    it('first-person: the eye rides eyeHeight above the FEET, never above the head', async () => {
        const { engine, cam, body, feet, camPos } = await bootOnGround();

        engine.setCameraView('first');
        stepN(engine, SETTLE);

        const eyeY = camPos()[1];
        expect(cam.offset[1]).toBeCloseTo(1.7, 5);            // declared, feet-relative
        expect(eyeY - feet).toBeCloseTo(cam.offset[1], 5);    // …and that's where the eye is
        // The invariant the old bug violated: the eye sits inside the body. Here
        // the visual body IS the capsule (this world declares no avatar physique);
        // a declared taller avatar rides its own height, not the capsule's.
        expect(eyeY).toBeLessThanOrEqual(feet + body.size[1] + 1e-9);
        expect(eyeY).toBeGreaterThan(feet);
    });

    it('third-person: same eye, lifted and pulled back — still head-high, not sky-high', async () => {
        const { engine, cam, body, feet, trans, camPos } = await bootOnGround();

        engine.setCameraView('third');
        stepN(engine, SETTLE);

        const [cx, cy, cz] = camPos();
        expect(cy - feet).toBeCloseTo(cam.offset[1] + 1.2, 5);   // eye + TP_HEIGHT
        expect(cy).toBeLessThan(feet + body.size[1] + 1.5);      // a step above the head, not a drone
        // Pulled back along the look direction (yaw 0 ⇒ straight behind on +Z).
        expect(Math.hypot(cx - trans.position[0], cz - trans.position[2])).toBeCloseTo(4.5, 5);
    });

    it('spawns with the camera already at the eye (no first-frame jump)', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const trans = world.getComponent<any>(player, 'TransformComponent');
        const body = world.getComponent<any>(player, 'RigidBodyComponent');
        const cam = world.getComponent<any>(player, 'CameraComponent');

        // Straight out of setupPlayer — before any step has run.
        const feet = trans.position[1] + body.offset[1] - body.size[1] / 2;
        expect(nullEngine.__counts.lastCameraPos![1] - feet).toBeCloseTo(cam.offset[1], 5);
    });
});

describe('camera view transition (first↔third dolly)', () => {
    it('eases instead of cutting: no single frame carries more than a fraction of the move', async () => {
        const { engine, camPos } = await bootOnGround();
        const from = camPos();

        engine.setCameraView('first');
        let prev = from;
        let biggestStep = 0;
        for (let i = 0; i < SETTLE; i++) {
            engine.step(1 / 60);
            const now = camPos();
            biggestStep = Math.max(biggestStep, Math.hypot(now[0] - prev[0], now[1] - prev[1], now[2] - prev[2]));
            prev = now;
        }

        const total = Math.hypot(from[0] - prev[0], from[1] - prev[1], from[2] - prev[2]);
        expect(total, 'the full 4.5 m back + 1.2 m up move happened').toBeCloseTo(Math.hypot(4.5, 1.2), 1);
        // A cut would put 100% of it in one frame; a 0.3 s smoothstep peaks well under 15%.
        expect(biggestStep / total).toBeLessThan(0.15);
        expect(biggestStep).toBeGreaterThan(0);   // …but it does move
    });

    it('lands exactly on the endpoint, and a mid-flight flip walks back', async () => {
        const { engine, cam, feet, camPos } = await bootOnGround();

        engine.setCameraView('first');
        stepN(engine, SETTLE);
        expect(camPos()[1] - feet).toBeCloseTo(cam.offset[1], 5);   // exactly the eye, no residue

        // Flip back, sample mid-dolly, then flip again — the ramp reverses cleanly.
        engine.setCameraView('third');
        stepN(engine, 6);
        const mid = camPos()[1] - feet;
        expect(mid).toBeGreaterThan(cam.offset[1]);                 // rising toward the follow-cam
        expect(mid).toBeLessThan(cam.offset[1] + 1.2);              // …but not there yet
        engine.setCameraView('first');
        stepN(engine, SETTLE);
        expect(camPos()[1] - feet).toBeCloseTo(cam.offset[1], 5);
    });

    it('immediate: rigs that sample the next frame get the endpoint at once', async () => {
        const { engine, cam, feet, camPos } = await bootOnGround();

        engine.setCameraView('first', true);
        engine.step(1 / 60);
        expect(camPos()[1] - feet).toBeCloseTo(cam.offset[1], 5);

        engine.setCameraView('third', true);
        engine.step(1 / 60);
        expect(camPos()[1] - feet).toBeCloseTo(cam.offset[1] + 1.2, 5);
    });

    it('hides the avatar until the dolly clears the body (no faceful of backfaces)', async () => {
        const { engine, world, player, camPos, trans } = await bootOnGround();
        const avatar = world.getComponent<any>(player, 'AvatarComponent');

        expect(avatar.handle.visible, 'third-person: visible').toBe(true);

        engine.setCameraView('first');
        for (let i = 0; i < SETTLE; i++) {
            engine.step(1 / 60);
            const c = camPos();
            const dist = Math.hypot(c[0] - trans.position[0], c[2] - trans.position[2]);
            if (avatar.handle.visible) expect(dist, 'never shown while inside the body').toBeGreaterThanOrEqual(1.0);
        }
        expect(avatar.handle.visible, 'first-person: hidden').toBe(false);
    });
});
