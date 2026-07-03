import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// THE walkability proof for the AI-authoring 'building' generator: a real
// player, driven only by move intent through the real collider, climbs one
// full storey up the L-shaped stairs and walks back down. If tread rise, run,
// landing, slab-opening or HEADROOM geometry regresses, this fails.
//
// Layout (w=8 d=8 fh=2.8 at origin [8,8], world coords): flight A treads
// x 8.55→10.55 at y=11.15 (west→east, tops 0.35..1.4); NE landing (11.15,
// 11.15) z=1.4; flight B treads y 10.55→8.55 at x=11.15 (north→south, tops
// 1.75..2.8); slab body starts at y≤8.25. Identical plan every storey →
// vertical clearance is uniformly fh−T≈2.55 in both walking directions.

const BX = 2048, BY = 2048;

function playerOf(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}

describe('building stairs — a real player climbs and descends', () => {
    it('E up flight A → S up flight B → one storey up; N then W → back down', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Motif, [[[8, 8, 0], 'building', 7, { floors: 5, w: 8, d: 8, floorHeight: 2.8 }]]]], [], 0],
        });
        stepN(engine, 5);

        const t = world.getComponent(playerOf(world), 'TransformComponent');
        const spp = (e: number, n: number, alt: number) => {
            t.position[0] = (BX - 1) * 16 + e;
            t.position[1] = alt;
            t.position[2] = -((BY - 1) * 16 + n);
            t.dirty = true;
        };
        const alt = () => t.position[1];
        const walk = (ix: number, iy: number, frames: number, label = '') => {
            (engine as any).setMoveIntent(ix, iy);
            stepN(engine, frames);
            (engine as any).setMoveIntent(0, 0);
            stepN(engine, 25); // settle any in-flight drop
            const e = t.position[0] - (BX - 1) * 16, n = -t.position[2] - (BY - 1) * 16;
            console.log(`[walk ${label}] E=${e.toFixed(2)} N=${n.toFixed(2)} alt=${t.position[1].toFixed(2)}`);
        };

        // Start on the north lane, west of flight A's first tread.
        spp(8.0, 11.15, 1.0);
        stepN(engine, 30);
        expect(alt()).toBeLessThan(1.5); // on the ground floor

        walk(1, 0, 150, 'A-up');    // east: climb flight A to the corner landing (z 1.4)
        expect(alt()).toBeGreaterThan(1.9);
        walk(0, -1, 170, 'B-up');   // south: climb flight B → storey 1 (z 2.8), onto the slab
        expect(alt()).toBeGreaterThan(3.4);

        // And back down the same stairs. Small sidesteps first: hugging a wall
        // can ride its 5 mm top rim (the resolveY full-box vs margin-shrunk
        // horizontal box tradeoff, documented in MovementCollider) — half a
        // step off the wall is what a real descent path looks like anyway.
        walk(-1, 0, 5, 'off-wall');   // ~0.4 m: off the rim, still lane-centre
        walk(0, 1, 170, 'B-down');  // north: descend flight B to the landing
        expect(alt()).toBeLessThan(2.6);
        walk(0, -1, 5, 'off-wall2');
        walk(-1, 0, 170, 'A-down'); // west: descend flight A to the ground floor
        expect(alt()).toBeLessThan(1.6);
    });
});
