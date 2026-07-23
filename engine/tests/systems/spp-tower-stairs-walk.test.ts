import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { expandSpp } from '../../src/core/spp/Expander';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';

// Walkability proof for the SPP tower stairwell: the brick StylePack's
// 'stair_top' variant (slab-with-hole + switchback treads hung below it) must
// carry a REAL player, driven only by move intent through the real collider,
// up two full 4 m storeys and back down one. This is the load-bearing test for
// the gallery SPP tower (block 2001,1011) — stairs as pure StylePack data.
//
// Cell frame (origin [6,6], 4 m cell, per storey k at z0=4k):
//   flight A (west lane E 6..7.2) ascends north: tread tops z0+0.4..1.6
//   landing  (E 6..8.4, N 8.8..10) at z0+2
//   flight B (mid lane E 7.2..8.4) ascends south: tread tops z0+2.4..3.6
//   exit: step EAST (or south) off the top tread onto the storey slab z0+4

const BX = 2048, BY = 2048;
const PACK = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../../client/core/src/stylepacks/brick.stylepack.json'), 'utf8')) as StylePack;

const F = (top: any, bottom: any) => [top, bottom, [1, 'solid'], [1, 'solid'], [1, 'solid'], [1, 'solid']];
const COLUMN = [
    { position: [0, 0, 0], level: 0, faces: F([1, 'stair_top'], [1, 'floor']) },
    { position: [0, 0, 1], level: 0, faces: F([1, 'stair_top'], [0, 'empty']) },
    { position: [0, 0, 2], level: 0, faces: F([1, 'floor'], [0, 'empty']) },
];

describe('SPP tower stairs — StylePack stair_top variant', () => {
    it('geometry: one stairwell cell derives the full tread ladder', () => {
        registerStylePack(PACK);
        const rows = expandSpp([[6, 6, 0], [COLUMN[0]] as any, 'brick']);
        const boxes = rows.filter(([t]) => t === AdjunctType.Box);
        const tops = boxes.map(([, r]) => +((r[1] as number[])[2] + (r[0] as number[])[2] / 2).toFixed(4)).sort((a, b) => a - b);
        // bottom 'floor' plinth + 8 treads + landing + flight divider + 3 slabs at z4
        expect(tops).toEqual([0.25, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 3.6, 4, 4, 4]);
        for (const [, r] of boxes) expect(r[6]).toBe(1); // every piece solid
    });

    it('a real player climbs two storeys and walks back down one', async () => {
        const engine = await makeHeadlessEngine();
        (engine as any).registerStylePack(PACK);
        const world: any = engine.getWorld()!;
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Spp, [[[6, 6, 0], COLUMN, 'brick']]]], [], 0],
        });
        stepN(engine, 5);

        const t = world.getComponent(
            world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0], 'TransformComponent');
        const spp = (e: number, n: number, alt: number) => {
            t.position[0] = (BX - 1) * 16 + e;
            t.position[1] = alt;
            t.position[2] = -((BY - 1) * 16 + n);
            t.dirty = true;
        };
        const alt = () => t.position[1];
        const leg = (label: string, ix: number, iy: number, frames: number) => {
            (engine as any).setMoveIntent(ix, iy);
            stepN(engine, frames);
            (engine as any).setMoveIntent(0, 0);
            stepN(engine, 20);
            const e = t.position[0] - (BX - 1) * 16, n = -t.position[2] - (BY - 1) * 16;
            console.log(`[${label}] E=${e.toFixed(2)} N=${n.toFixed(2)} alt=${alt().toFixed(2)}`);
        };

        spp(6.7, 6.8, 1.8);            // west lane on tread 2, clear of the south wall
        stepN(engine, 30);
        expect(alt()).toBeLessThan(2.0);

        // ── storey 0 → 1 ──
        leg('A1-up   N', 0, 1, 40);    // flight A to the landing (z2)
        expect(alt()).toBeGreaterThan(2.7);
        leg('landing E', 1, 0, 15);    // shift to the mid lane
        leg('B1-up   S', 0, -1, 30);   // flight B to the top tread (z3.6)
        expect(alt()).toBeGreaterThan(4.3);
        leg('exit    E', 1, 0, 15);    // onto the storey-1 slab (z4)
        expect(alt()).toBeGreaterThan(4.7);

        // ── storey 1 → 2 (identical plan, one storey up; circulation runs
        //    along the south band, clear of the hovering flight-A treads) ──
        leg('band    S', 0, -1, 5);    // hug the south wall
        leg('cross   W', -1, 0, 32);   // across the S3 bridge to the west lane
        leg('A2-up   N', 0, 1, 40);
        expect(alt()).toBeGreaterThan(6.7);
        leg('landing E', 1, 0, 15);
        leg('B2-up   S', 0, -1, 30);
        expect(alt()).toBeGreaterThan(8.3);
        leg('exit    E', 1, 0, 15);
        expect(alt()).toBeGreaterThan(8.7); // standing on the storey-2 slab (z8)

        // ── storey 2 → 1 (walk it back down) ──
        leg('down    W', -1, 0, 15);   // step off onto flight B's top tread
        leg('B2-down N', 0, 1, 30);    // descend to the landing (z6)
        expect(alt()).toBeLessThan(7.2);
        leg('shift   W', -1, 0, 16);   // still on the landing, west lane side
        leg('A2-down S', 0, -1, 40);   // descend flight A onto the storey-1 slab
        expect(alt()).toBeLessThan(5.1);
        expect(alt()).toBeGreaterThan(4.3); // …and not fallen to the ground floor
    });
});
