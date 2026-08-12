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
        // Horizontal pieces only. Since the brick pack became textured (a2 parts
        // instead of legacy a1 pieces) the four full-height façade walls are boxes
        // too; they all top out at the cell ceiling and would swamp the ladder.
        const flat = boxes.filter(([, r]) => (r[0] as number[])[2] < 2);
        const tops = flat.map(([, r]) => +((r[1] as number[])[2] + (r[0] as number[])[2] / 2).toFixed(4)).sort((a, b) => a - b);
        // bottom 'floor' plinth + 8 treads + landing + flight divider + 3 slabs at z4
        expect(tops).toEqual([0.25, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 3.6, 4, 4, 4]);
        expect(boxes.length - flat.length, 'four 4 m brick walls').toBe(4);
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

// The switchback stair geometry is SHARED — brick / garden / ice (and spanish)
// are cut from one template. Only brick was covered, and on 2026-08-09 garden's
// copy was "tidied": its flight divider read as a stray deep handrail, was
// removed, the two runs collapsed into one 0.62 m-per-tread flight, and garden
// shipped unclimbable. brick's climb above caught it there; nothing watched
// garden.
//
// The fix is NOT "walk a player up every pack". That was tried (2026-08-12) and
// it does not port: step-up depends on approach SPEED, and speed depends on how
// much that pack's walls rub against the player. garden's hedge carries a
// moulding down the whole face and slows them to 0.9 m per leg; ice's wall has
// three narrow ribs and they hit 2.6 m per leg — same stairs, and at that speed
// the 0.4 m rise to the half-landing launches them clean over it and out
// through the north wall. Tuning leg length per pack would be fitting magic
// numbers to a collider, and the result would say nothing about the stairs.
//
// What actually needs guarding is that the shared template STAYS shared: brick's
// climb proves this geometry carries a player, so any pack whose stair_top is
// byte-identical to it inherits that proof. Diverge one and this goes red,
// naming the pack and the field — which is exactly the failure that shipped.
const TEMPLATE_PACKS = ['garden', 'ice', 'spanish'];
const frameOf = (v: any) => (v.parts ?? []).map((p: any) =>
    [p.type, p.u, p.v, p.su, p.sv, p.w ?? 0, p.sw ?? null]);
const stairOf = (pack: string) => {
    const json = JSON.parse(fs.readFileSync(path.join(
        __dirname, `../../../client/core/src/stylepacks/${pack}.stylepack.json`), 'utf8'));
    return (json.closed ?? []).find((v: any) => (v.key ?? v.name) === 'stair_top');
};

describe('SPP stairwell — the switchback template stays shared', () => {
    const reference = frameOf(stairOf('brick'));

    it('brick\'s stair_top is the template the climb above proves', () => {
        expect(reference.length, 'slab ×3 + landing + 8 treads + flight divider').toBe(13);
        // The divider is the part that got "fixed" away. It is deep ON PURPOSE —
        // it separates the two runs — and the contract guard flags it
        // `part-too-deep` because the guard reads every option as cladding.
        const divider = reference[12];
        expect(divider[6], 'the flight divider keeps its depth').toBeCloseTo(0.375);
    });

    for (const pack of TEMPLATE_PACKS) {
        it(`${pack} carries the same geometry (colour may differ, shape may not)`, () => {
            expect(frameOf(stairOf(pack))).toEqual(reference);
        });
    }
});
