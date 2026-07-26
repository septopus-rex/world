import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { expandMotif } from '../../src/core/motif/MotifExpander';
import galleryLevel from '../../../client/core/src/levels/gallery.level.json';

// Walkability proof for the switchback stair authored on gallery block 2000,1010:
// 8 flights × 3 m = 24 m, 2 m wide, ending on a parapeted platform. Content is
// pure data — 8 c2 `stairs` motif rows + 12 a2 slabs — so this test drives the
// REAL level document, not a fixture, and a real player through the real collider.
//
// Layout (block-local metres):
//   lane A  E 1.0..3.0   flights 1,3,5,7 ascend +N from N 5 → 9
//   gap     E 3.0..3.7   deliberate: adjacent lanes let the 0.6 m capsule reach
//                        into the other lane's hovering treads, and that head
//                        contact vetoes the step-up (the SPP tower needed a
//                        balustrade for the same reason)
//   lane B  E 3.7..5.7   flights 2,4,6,8 ascend −N from N 9 → 5
//   landings E 1.0..5.7 × 2 m deep at N 9..11 (odd) / N 3..5 (even), tops 3,6,…,21
//   platform E 0.9..5.8 × N 1..5 at 24 m

const BX = 2048, BY = 2048;
const BLOCK = (galleryLevel as any).blocks.find((b: any) => b.x === 2000 && b.y === 1010);
const FLIGHTS = BLOCK.raw[2].find((g: any) => g[0] === AdjunctType.Motif)[1];
const LANE_A = 2.0, LANE_B = 4.7;

describe('gallery 2000,1010 — 8-flight switchback stair to 24 m', () => {
    it('is authored as 8 alternating 3 m flights (data, not code)', () => {
        expect(FLIGHTS.length).toBe(8);
        FLIGHTS.forEach((row: any, i: number) => {
            const [origin, template, , params] = row;
            expect(template).toBe('stairs');
            expect(params.height).toBe(3);
            expect(params.width).toBe(2);
            // Odd flights ascend north from N 5, even ones back south from N 9.
            expect(params.dir).toBe(i % 2 === 0 ? 0 : 2);
            expect(origin[0]).toBe(i % 2 === 0 ? LANE_A : LANE_B);
            expect(origin[1]).toBe(i % 2 === 0 ? 5 : 9);
            expect(origin[2]).toBe(3 * i);          // each flight starts where the last ended
        });
    });

    it('the treads form one continuous 0.375 m ladder from 0 to 24 m', () => {
        const tops: number[] = [];
        for (const row of FLIGHTS) {
            for (const [type, raw] of expandMotif(row as any)) {
                expect(type).toBe(AdjunctType.Box);
                tops.push(+((raw[1] as number[])[2] + (raw[0] as number[])[2] / 2).toFixed(4));
            }
        }
        tops.sort((a, b) => a - b);
        // 8 flights × 8 treads (3 m / 0.4 m max rise → 8 steps of 0.375).
        expect(tops.length).toBe(64);
        expect(tops[0]).toBe(0.375);
        expect(tops[63]).toBe(24);
        for (let i = 1; i < tops.length; i++) {
            expect(+(tops[i] - tops[i - 1]).toFixed(4), `gap before tread ${i}`).toBe(0.375);
        }
    });

    it('a real player climbs all 8 flights and stands on the top platform', async () => {
        const engine = await makeHeadlessEngine();
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: BLOCK.raw,
        } as any);
        stepN(engine, 5);

        const world: any = engine.getWorld()!;
        const t = world.getComponent(
            world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0], 'TransformComponent');
        const place = (e: number, n: number, alt: number) => {
            t.position[0] = (BX - 1) * 16 + e;
            t.position[1] = alt;
            t.position[2] = -((BY - 1) * 16 + n);
            t.dirty = true;
        };
        const alt = () => t.position[1];
        const east = () => t.position[0] - (BX - 1) * 16;
        const north = () => -t.position[2] - (BY - 1) * 16;
        const leg = (label: string, ix: number, iy: number, frames: number) => {
            (engine as any).setMoveIntent(ix, iy);
            stepN(engine, frames);
            (engine as any).setMoveIntent(0, 0);
            stepN(engine, 20);
            console.log(`[${label}] E=${east().toFixed(2)} N=${north().toFixed(2)} alt=${alt().toFixed(2)}`);
        };

        // Start on the ground, just south of flight 1's first tread.
        place(LANE_A, 4.2, 1.0);
        stepN(engine, 30);
        expect(alt(), 'standing on the block ground (capsule centre ≈ feet + 0.9)').toBeLessThan(1.1);

        for (let k = 1; k <= 8; k++) {
            const upNorth = k % 2 === 1;
            // Up the flight: 4 m of run + 3 m of rise. Walking costs ~0.082 m of
            // ground per frame whether climbing or not, so 55 frames ≈ 4.5 m —
            // just past the top tread and onto the landing. Sized deliberately:
            // 110 frames walked the full flight, crossed the 2 m landing and
            // stepped off its far edge (measured: back to 0.9 m at N 14).
            leg(`flight ${k} ${upNorth ? 'N' : 'S'}`, 0, upNorth ? 1 : -1, 55);
            expect(alt(), `flight ${k} did not reach ${3 * k} m`).toBeGreaterThan(3 * k + 0.5);

            if (k === 8) break;
            // Cross the landing into the other lane (east on odd, west on even).
            leg(`cross ${k}`, upNorth ? 1 : -1, 0, 32);   // 2.7 m between lane centres
            const lane = upNorth ? LANE_B : LANE_A;
            expect(Math.abs(east() - lane), `did not reach lane at E ${lane}`).toBeLessThan(1.1);
            expect(alt(), `fell off landing ${k}`).toBeGreaterThan(3 * k + 0.5);
        }

        // Flight 8 tops out at 24 m and delivers onto the platform (top 24).
        expect(alt()).toBeGreaterThan(24.5);
        expect(north(), 'flight 8 ends at the south, on the platform').toBeLessThan(5.6);

        // Walk out onto the platform — the parapet must keep the player on it.
        leg('platform S', 0, -1, 90);
        expect(alt(), 'still up top, not fallen 24 m').toBeGreaterThan(24.5);
        expect(north(), 'south parapet stops the walk').toBeGreaterThan(1.0);
    });
});
