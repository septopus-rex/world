import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { AdjunctStop, STOP_SHAPE } from '../../src/plugins/adjunct/basic_stop';

// Stop shapes (b4 slot 5): BALL = vertical cylinder collider, SLOPE = wedge
// ramp with a height-function top face (arbitrary vertical-axis yaw). A real
// player, driven only by move intent through the real collider, proves each
// shape's contract: circular footprint (no AABB corner snag), ramp walk-up /
// walk-down via the step-over channel, vertical back face blocking, and yaw
// rotation agreement between data (raw ry — engine yaw, coordinate.md §3.1)
// and collision.
//
// Player body: [0.6, 1.8, 0.6] (half-width 0.3, half-height 0.9), horizontal
// margin 0.01 → bounding-circle radius ≈ 0.29; stepHeight 0.5.

const BX = 2048, BY = 2048;

function playerOf(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}

/** Boot a headless engine with the given b4 stop rows in an otherwise empty block. */
async function bootWithStops(rows: any[]) {
    const engine = await makeHeadlessEngine();
    const world: any = engine.getWorld()!;
    engine.injectBlock({
        x: BX, y: BY, world: 'main', elevation: 0,
        adjuncts: [0, 1, [[AdjunctType.Stop, rows]], [], 0],
    });
    stepN(engine, 10);
    const t = world.getComponent(playerOf(world), 'TransformComponent');
    const spp = (e: number, n: number, alt: number) => {
        t.position[0] = (BX - 1) * 16 + e;
        t.position[1] = alt;
        t.position[2] = -((BY - 1) * 16 + n);
        t.dirty = true;
    };
    const E = () => t.position[0] - (BX - 1) * 16;
    const N = () => -t.position[2] - (BY - 1) * 16;
    const alt = () => t.position[1];
    /** Hold a move intent until cond() (or maxFrames), then settle. True = reached. */
    const walkUntil = (ix: number, iy: number, cond: () => boolean, maxFrames = 900) => {
        (engine as any).setMoveIntent(ix, iy);
        let i = 0;
        for (; i < maxFrames && !cond(); i++) engine.step(1 / 60);
        (engine as any).setMoveIntent(0, 0);
        stepN(engine, 25);
        return i < maxFrames;
    };
    return { engine, world, t, spp, E, N, alt, walkUntil };
}

describe('stop raw slot 5 — shape round-trip', () => {
    it('deserializes the shape slot (default BOX) and serializes it back', () => {
        const rowBall = [[4, 4, 2], [8, 8, 1], [0, 0, 0], 1, null, STOP_SHAPE.BALL];
        const std = AdjunctStop.attribute.deserialize(rowBall);
        expect(std.stopShape).toBe(STOP_SHAPE.BALL);
        expect(std.stop).toBe(true);
        expect(AdjunctStop.attribute.serialize(std)[5]).toBe(STOP_SHAPE.BALL);

        const legacy = AdjunctStop.attribute.deserialize([[1, 1, 1], [2, 2, 0.5], [0, 0, 0], 1, null]);
        expect(legacy.stopShape).toBe(STOP_SHAPE.BOX); // old 5-slot rows stay boxes
    });
});

describe('ball stop — cylinder collider', () => {
    // r=2, height 2, centred at (8,8): exactly over the default spawn.
    const BALL_ROW = [[4, 4, 2], [8, 8, 1], [0, 0, 0], 1, null, STOP_SHAPE.BALL];

    it('spawn inside pops onto the round top; the top is standable', async () => {
        const { alt } = await bootWithStops([BALL_ROW]);
        // popOutIfEmbedded via topYAt: top z=2 → centre 2 + 0.9.
        expect(alt()).toBeGreaterThan(2.5);
        expect(alt()).toBeLessThan(3.2);
    });

    it('blocks at the circle tangent, not at an AABB corner', async () => {
        const { spp, E, N, alt, walkUntil } = await bootWithStops([BALL_ROW]);

        // Head-on from the west: blocked at x ≈ 8 − (2 + 0.29).
        spp(4, 8, 0.95);
        walkUntil(1, 0, () => false, 240); // push east into the pillar until frames run out
        console.log(`[ball head-on] E=${E().toFixed(2)} N=${N().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(E()).toBeGreaterThan(5.4);   // got close…
        expect(E()).toBeLessThan(5.95);     // …but the tangent held (AABB face would sit at 5.7 too,
        expect(alt()).toBeLessThan(1.5);    // never climbed it

        // Diagonal from the NE "corner": with a circular footprint the player
        // HUGS the circle and SLIDES AROUND the pillar (an AABB corner blocks
        // both axes and pins the player at chebyshev ≥ 2.29 ⇒ radial ≥ 3.2;
        // the old tangent-snap resolver froze the walk at the ring — the
        // stuck-at-⑭ bug in its walk-in form).
        const { engine: e2, spp: spp2, E: E2, N: N2 } = await bootWithStops([BALL_ROW]);
        spp2(11, 11, 0.95);
        (e2 as any).setMoveIntent(-1, -1);
        let minRadial = Infinity;
        for (let i = 0; i < 300; i++) {
            e2.step(1 / 60);
            minRadial = Math.min(minRadial, Math.hypot(E2() - 8, N2() - 8));
        }
        (e2 as any).setMoveIntent(0, 0);
        console.log(`[ball diagonal] end E=${E2().toFixed(2)} N=${N2().toFixed(2)} minRadial=${minRadial.toFixed(2)}`);
        expect(minRadial).toBeGreaterThan(2.0);   // never entered the cylinder…
        expect(minRadial).toBeLessThan(2.9);      // …but hugged the circle (AABB corner ⇒ ≥ 3.2)
        expect(Math.hypot(E2() - 11, N2() - 11), 'slid around the pillar, not frozen at the ring').toBeGreaterThan(5);
    });
});

describe('ball stop — diagonal contact must not trap or yank (gallery ⑭ regression)', () => {
    const BALL_ROW = [[4, 4, 2], [8, 8, 1], [0, 0, 0], 1, null, STOP_SHAPE.BALL];

    it('resting at a diagonal corner contact, EVERY direction still walks free', async () => {
        // The old resolver used a looser metric for the push (bounding circle)
        // than for the overlap test (player rect): at a diagonal contact the
        // rect kept overlapping while every axis move — retreat included — was
        // snapped back to the tangent ring. All four directions froze.
        for (const [ix, iy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const { spp, E, N, walkUntil } = await bootWithStops([BALL_ROW]);
            spp(9.65, 9.65, 0.95);   // NE of the pillar, rect corner just clipping the circle
            const e0 = E(), n0 = N();
            walkUntil(ix, iy, () => false, 90);
            const moved = Math.hypot(E() - e0, N() - n0);
            expect(moved, `direction (${ix},${iy}) must escape the contact`).toBeGreaterThan(0.5);
        }
    });

    it('a descending fall grazing the pillar slides down OUTSIDE — never yanked in, never popped on top', async () => {
        const { engine, world, spp, E, N, alt } = await bootWithStops([BALL_ROW]);
        const t = world.getComponent(playerOf(world), 'TransformComponent');
        const b = world.getComponent(playerOf(world), 'RigidBodyComponent');

        // Airborne NE of the pillar, feet just under the top rim, drifting
        // inward — the S-shaped landing that reproduced the in-browser "hop".
        spp(10.9, 10.9, 2.7);
        b.velocity[0] = -2.4; b.velocity[2] = 2.4; b.velocity[1] = -1;  // toward SW (sept), falling
        (engine as any).setMoveIntent(-1, -1);
        let prevAlt = alt();
        let maxRise = 0;
        for (let i = 0; i < 240; i++) {
            engine.step(1 / 60);
            maxRise = Math.max(maxRise, alt() - prevAlt);
            prevAlt = alt();
        }
        (engine as any).setMoveIntent(0, 0);
        stepN(engine, 30);

        // The deep-embed pop teleports the feet onto the top (alt jumps ~+1m in
        // one frame) — a clean fall must never gain height.
        expect(maxRise, 'no upward teleport (popOutIfEmbedded must not fire)').toBeLessThan(0.05);
        // And the player ends on the ground BESIDE the pillar, not on it.
        expect(alt()).toBeLessThan(1.5);
        expect(Math.hypot(E() - 8, N() - 8), 'outside the cylinder footprint').toBeGreaterThan(2.0);
    });
});

describe('slope stop — wedge ramp, yaw 0 (rises north)', () => {
    // Footprint E∈[6,10] N∈[4,12]; surface z = (n−4)/4: 0 at the south edge → 2 at the north edge.
    const SLOPE_ROW = [[4, 8, 2], [8, 8, 1], [0, 0, 0], 1, null, STOP_SHAPE.SLOPE];

    it('walks up the ramp and back down; altitude follows the plane', async () => {
        const { spp, N, alt, walkUntil } = await bootWithStops([SLOPE_ROW]);

        spp(8, 2.5, 0.95);
        // Up: south approach, walk north to near the top edge.
        expect(walkUntil(0, 1, () => N() >= 11.4)).toBe(true);
        console.log(`[slope up] N=${N().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(alt()).toBeGreaterThan(2.5);  // surface ≈1.85 + 0.9
        expect(alt()).toBeLessThan(3.0);

        // Mid-ramp check on the way down: surface tracks the plane, not a step edge.
        expect(walkUntil(0, -1, () => N() <= 8)).toBe(true);
        console.log(`[slope mid-down] N=${N().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(alt()).toBeGreaterThan(1.4);
        expect(alt()).toBeLessThan(2.2);

        // All the way off the south edge: back on flat ground.
        expect(walkUntil(0, -1, () => N() <= 3)).toBe(true);
        expect(alt()).toBeLessThan(1.2);
    });

    it('the tall north face is a wall — no climbing in from behind', async () => {
        const { spp, N, alt, walkUntil } = await bootWithStops([SLOPE_ROW]);
        spp(8, 14, 0.95);
        walkUntil(0, -1, () => false, 240); // push south into the 2 m back face
        console.log(`[slope back-face] N=${N().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(N()).toBeGreaterThan(12.05); // held outside the footprint
        expect(alt()).toBeLessThan(1.3);    // and never climbed it
    });
});

describe('slope stop — vertical-axis (yaw) rotation', () => {
    it('yaw −π/2: the same ramp rises EAST; player climbs it walking east', async () => {
        // Local ascent axis (length 8) maps to world E–W: footprint x∈[4,12], n∈[6,10].
        const row = [[4, 8, 2], [8, 8, 1], [0, -Math.PI / 2, 0], 1, null, STOP_SHAPE.SLOPE];
        const { spp, E, alt, walkUntil } = await bootWithStops([row]);
        spp(2.5, 8, 0.95);
        expect(walkUntil(1, 0, () => E() >= 11.4)).toBe(true);
        console.log(`[slope yaw-east up] E=${E().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(alt()).toBeGreaterThan(2.5);
        expect(alt()).toBeLessThan(3.0);
    });

    it('yaw −π/4: rises to the NORTH-EAST; player climbs it walking the diagonal', async () => {
        const row = [[4, 8, 2], [8, 8, 1], [0, -Math.PI / 4, 0], 1, null, STOP_SHAPE.SLOPE];
        const { spp, E, N, alt, walkUntil } = await bootWithStops([row]);
        spp(4.6, 4.6, 0.95); // just off the low (SW) end
        expect(walkUntil(1, 1, () => E() >= 10.2 && N() >= 10.2)).toBe(true);
        console.log(`[slope yaw-45 up] E=${E().toFixed(2)} N=${N().toFixed(2)} alt=${alt().toFixed(2)}`);
        expect(alt()).toBeGreaterThan(2.3); // near the high (NE) end
    });
});
