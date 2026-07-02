import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// Hardening ① (data layer): WorldConfig.block.max — the lord's per-block
// authored-adjunct cap — is ENFORCED at inject (over-cap rows dropped +
// reported). It used to be dead config. Derived entities (SPP expansion) and
// the auto-ground don't count against it.

function boxRow(i: number): any[] {
    // [size, pos, rot, resId, repeat, anim, stop] — spread along East so rows differ
    return [[0.5, 0.5, 0.5], [(i % 14) + 1, Math.floor(i / 14) + 1, 1], [0, 0, 0], 0, [1, 1], 0, 0];
}

describe('block.max enforcement (inject)', () => {
    it('drops authored rows beyond the cap and keeps the first N', async () => {
        const engine = await makeHeadlessEngine(); // MockWorldNormal: block.max = 64
        const world = engine.getWorld()!;

        const rows = Array.from({ length: 70 }, (_, i) => boxRow(i));
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [0, 1, [[AdjunctType.Box, rows]], [], 0], elevation: 0 });
        stepN(engine, 4);

        const authoredBoxes = world.getEntitiesWith(['AdjunctComponent'])
            .map((eid) => world.getComponent<any>(eid, 'AdjunctComponent'))
            .filter((a) => a?.adjunctId?.includes('_162_'));
        expect(authoredBoxes).toHaveLength(64); // capped, not 70

        // First-N kept: row 0 exists, row 69 does not.
        const ids = new Set(authoredBoxes.map((a) => a.adjunctId));
        expect(ids.has('adj_2048_2048_162_0')).toBe(true);
        expect(ids.has('adj_2048_2048_162_69')).toBe(false);
    });

    it('a block under the cap is untouched', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        const rows = Array.from({ length: 10 }, (_, i) => boxRow(i));
        engine.injectBlock({ x: 2049, y: 2048, world: 'main', adjuncts: [0, 1, [[AdjunctType.Box, rows]], [], 0], elevation: 0 });
        stepN(engine, 4);
        const boxes = world.getEntitiesWith(['AdjunctComponent'])
            .map((eid) => world.getComponent<any>(eid, 'AdjunctComponent'))
            .filter((a) => a?.adjunctId?.includes('2049_2048_162_'));
        expect(boxes).toHaveLength(10);
    });
});
