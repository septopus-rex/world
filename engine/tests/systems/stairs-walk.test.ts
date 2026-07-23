import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// Walkability proof for the standalone 'stairs' motif template: a real player,
// driven only by move intent through the real collider, climbs a full flight
// onto the landing and walks back down — plus the doorstep case (one 0.4 m
// tread crossed mid-stride, no jump). If tread rise/run or the dir rotation
// regresses, this fails. Walk speed is ~5 m/s (~0.083 m/frame), so frame
// counts below are sized to STOP ON the stairs, not sail off the far side.

const BX = 2048, BY = 2048;

function playerOf(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}

function makeDriver(engine: any, world: any) {
    const t = world.getComponent(playerOf(world), 'TransformComponent');
    const spp = (e: number, n: number, alt: number) => {
        t.position[0] = (BX - 1) * 16 + e;
        t.position[1] = alt;
        t.position[2] = -((BY - 1) * 16 + n);
        t.dirty = true;
    };
    const alt = () => t.position[1];
    const walk = (ix: number, iy: number, frames: number) => {
        engine.setMoveIntent(ix, iy);
        stepN(engine, frames);
        engine.setMoveIntent(0, 0);
        stepN(engine, 25); // settle any in-flight drop
    };
    const e = () => t.position[0] - (BX - 1) * 16;
    const n = () => -t.position[2] - (BY - 1) * 16;
    return { spp, alt, walk, e, n };
}

describe('stairs motif — a real player climbs, descends, and steps over', () => {
    it('north flight: up to the landing (z=2) and back down', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        // Treads n 6..8.5 (tops 0.4..2.0), landing n 8.5..9.7 at z=2.
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Motif, [[[8, 6, 0], 'stairs', 1,
                { height: 2, width: 1.4, dir: 0, landing: 1.2 }]]]], [], 0],
        });
        stepN(engine, 5);
        const { spp, alt, walk, n } = makeDriver(engine, world);

        spp(8, 4.5, 1.0);
        stepN(engine, 30);
        expect(alt()).toBeLessThan(1.5);       // on the ground

        walk(0, 1, 55);                        // north ~4.6 m: up the 5 treads
        expect(n()).toBeGreaterThan(8.5);      // stopped over the landing…
        expect(n()).toBeLessThan(9.7);
        expect(alt()).toBeGreaterThan(2.5);    // …standing at z=2

        walk(0, -1, 60);                       // south, back down
        expect(alt()).toBeLessThan(1.6);
    });

    it('doorstep (height 0.4, one tread) is crossed walking, no jump', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        // Single tread n 8..8.5, top z=0.4, width 2.
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Motif, [[[8, 8, 0], 'stairs', 1,
                { height: 0.4, width: 2 }]]]], [], 0],
        });
        stepN(engine, 5);
        const { spp, alt, walk, n } = makeDriver(engine, world);

        spp(8, 7, 1.0);
        stepN(engine, 30);
        walk(0, 1, 15);                        // ~1.25 m: onto the tread
        expect(alt()).toBeGreaterThan(1.25);   // standing 0.4 up
        walk(0, 1, 30);                        // over and off the far side
        expect(n()).toBeGreaterThan(9);
        expect(alt()).toBeLessThan(1.2);       // back on the ground
    });

    it('dir=1 flight ascends east', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        // Treads e 6..7.5 (tops 0.4..1.2), landing e 7.5..8.5 at z=1.2.
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Motif, [[[6, 8, 0], 'stairs', 1,
                { height: 1.2, width: 1.4, dir: 1, landing: 1 }]]]], [], 0],
        });
        stepN(engine, 5);
        const { spp, alt, walk, e } = makeDriver(engine, world);

        spp(4.5, 8, 1.0);
        stepN(engine, 30);
        walk(1, 0, 42);                        // east ~3.5 m: up 3 treads
        expect(e()).toBeGreaterThan(7.5);      // stopped over the landing…
        expect(e()).toBeLessThan(8.5);
        expect(alt()).toBeGreaterThan(1.9);    // …standing at z=1.2
    });
});
