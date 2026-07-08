import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { BlockComponent } from '../../src/core/components/BlockComponent';

// full-data-migration.md P1 — block-relative adjunct targets (the (c) geobase).
//
// The SAME authored content — a wall + a trigger whose action targets the wall
// by a BLOCK-RELATIVE id `adj_~_~_161_0` ("the a1 #0 in THIS block") — is placed
// in TWO different blocks. Each trigger must open ITS OWN block's wall (and not
// the other's), proving the content is relocatable / includable without baking
// absolute coordinates. This is the geobase the `include(ref,offset)` primitive
// stands on.

const A1 = 0x00a1; // wall (dec 161)
const B8 = 0x00b8; // trigger

/** Full 5-slot block raw: wall #0 + a trigger whose adjunct action uses the
 *  block-relative target. injectBlock wants the whole raw (its grouped-id path
 *  keys on `adjuncts[0]` being a number = elevation). */
function relDoorBlock(): any[] {
    return [0, 1, [
        [A1, [[[4, 0.4, 3], [8, 11, 1.5], [0, 0, 0], 0, [1, 1], 0, 1]]],
        [B8, [[[3, 3, 6], [8, 7, 3], [0, 0, 0], 1, 0, [
            { type: 'in', actions: [{ type: 'adjunct', target: 'adj_~_~_161_0', method: 'moveZ', params: [3.2] }] },
        ]]]],
    ], [], 0];
}

const OPEN_ACTION = { type: 'adjunct', target: 'adj_~_~_161_0', method: 'moveZ', params: [3.2] } as any;

describe('block-relative adjunct target (full-data-migration P1)', () => {
    it('same relative content in two blocks each opens its OWN wall (no cross-talk)', async () => {
        // Spawn-adjacent blocks so both stream in (BlockSystem materializes
        // adjuncts near the player; the default start is [2048,2048]).
        const engine = await makeHeadlessEngine();
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: relDoorBlock(), elevation: 0 });
        engine.injectBlock({ x: 2049, y: 2048, world: 'main', adjuncts: relDoorBlock(), elevation: 0 });
        stepN(engine, 10);
        const world = engine.getWorld()!;

        // Collect each block's wall + trigger entity.
        const byBlock = new Map<string, { wall?: number; trigger?: number }>();
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            const blk = a.parentBlockEntityId != null
                ? world.getComponent<BlockComponent>(a.parentBlockEntityId, 'BlockComponent') : null;
            if (!blk) continue;
            const key = `${blk.x}_${blk.y}`;
            const rec = byBlock.get(key) ?? {};
            byBlock.set(key, rec);
            if (a.stdData?.typeId === A1) rec.wall = eid;
            if (a.stdData?.typeId === B8) rec.trigger = eid;
        }
        const A = byBlock.get('2048_2048')!;
        const B = byBlock.get('2049_2048')!;
        expect(A?.wall != null && A?.trigger != null, 'block 2048_2048 wall+trigger materialized').toBe(true);
        expect(B?.wall != null && B?.trigger != null, 'block 2049_2048 wall+trigger materialized').toBe(true);

        const wa = world.getComponent<TransformComponent>(A.wall!, 'TransformComponent')!;
        const wb = world.getComponent<TransformComponent>(B.wall!, 'TransformComponent')!;
        const wa0 = wa.position[1]; // engine Y = Septopus Alt
        const wb0 = wb.position[1];

        // Fire block A's trigger only → only A's wall rises (relative → adj_2048_2048_161_0).
        world.actuator.execute(OPEN_ACTION, { world, playerId: null, mode: SystemMode.Normal, sourceEntity: A.trigger! });
        expect(wa.position[1] - wa0, 'A wall opened').toBeCloseTo(3.2, 3);
        expect(wb.position[1] - wb0, 'B wall untouched by A trigger').toBeCloseTo(0, 3);

        // Fire block B's trigger → B's wall rises (relative → adj_2049_2048_161_0).
        world.actuator.execute(OPEN_ACTION, { world, playerId: null, mode: SystemMode.Normal, sourceEntity: B.trigger! });
        expect(wb.position[1] - wb0, 'B wall opened').toBeCloseTo(3.2, 3);
    });

    it('an ABSOLUTE target still resolves unchanged (backward compatible)', async () => {
        const engine = await makeHeadlessEngine();
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: relDoorBlock(), elevation: 0 });
        stepN(engine, 10);
        const world = engine.getWorld()!;

        let wall: number | null = null, trigger: number | null = null;
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (a.stdData?.typeId === A1) wall = eid;
            if (a.stdData?.typeId === B8) trigger = eid;
        }
        const wt = world.getComponent<TransformComponent>(wall!, 'TransformComponent')!;
        const y0 = wt.position[1];
        // absolute id for this block's wall
        world.actuator.execute(
            { type: 'adjunct', target: 'adj_2048_2048_161_0', method: 'moveZ', params: [3.2] } as any,
            { world, playerId: null, mode: SystemMode.Normal, sourceEntity: trigger! },
        );
        expect(wt.position[1] - y0, 'absolute target still works').toBeCloseTo(3.2, 3);
    });
});
