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

        // Diagonal from the NE "corner": a 4×4 AABB would hold the player at
        // per-axis ≥ 2.2 (chebyshev); the circle lets them reach ~1.6 per axis.
        spp(11, 11, 0.95);
        walkUntil(-1, -1, () => false, 300);
        const dE = E() - 8, dN = N() - 8;
        const radial = Math.hypot(dE, dN);
        console.log(`[ball diagonal] dE=${dE.toFixed(2)} dN=${dN.toFixed(2)} radial=${radial.toFixed(2)}`);
        expect(radial).toBeGreaterThan(2.15);            // outside the cylinder
        expect(radial).toBeLessThan(2.75);               // pinned near the tangent
        expect(Math.max(Math.abs(dE), Math.abs(dN))).toBeLessThan(2.1); // impossible with an AABB corner
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
