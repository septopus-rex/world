import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// Spawn-inside-solid guard (MovementCollider.popOutIfEmbedded): placing the
// player INSIDE a solid — spawn point under authored content, teleport, or a
// moving solid sweeping the spawn — must pop them onto the solid's top instead
// of wedging them. The demo world shipped months with a spinning showcase
// pillar on the spawn point; every walk direction was blocked. This is the
// engine-level net that makes that class of content mistake self-healing.

const BX = 2048, BY = 2048;

function player(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}
const posOf = (world: any) => world.getComponent(player(world), 'TransformComponent').position;

describe('spawn-inside-solid guard', () => {
    it('a player spawned inside a solid box pops onto its top and can walk away', async () => {
        const engine = await makeHeadlessEngine(); // spawn [8,8,1] — inside the box below
        const world: any = engine.getWorld()!;
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[AdjunctType.Box, [[[2, 2, 2], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0]]]], [], 0],
        });
        stepN(engine, 10);

        // Rescued: standing ON the box (top alt 2 → engine y ≈ 2 + halfHeight 0.9).
        const p = posOf(world);
        expect(p[1]).toBeGreaterThan(2.5);

        // And locomotion works from up there (walks off the edge, lands, keeps going).
        const before = [...p];
        (engine as any).setMoveIntent(0, 1);
        stepN(engine, 90);
        (engine as any).setMoveIntent(0, 0);
        const after = posOf(world);
        const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
        expect(moved).toBeGreaterThan(1);
    });

    it('normal standing and walking never trips the guard (no phantom pops)', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        engine.injectBlock({
            x: BX, y: BY, world: 'main', elevation: 0,
            // A walkable low platform in the path — step-over must stay step-over.
            adjuncts: [0, 1, [[AdjunctType.Box, [[[2, 2, 0.4], [8, 11, 0.2], [0, 0, 0], 0, [1, 1], 0, 0]]]], [], 0],
        });
        stepN(engine, 60); // settle on flat ground
        expect(posOf(world)[1]).toBeLessThan(1.2); // standing at ~0.9, not popped

        (engine as any).setMoveIntent(0, 1);       // walk north over the platform
        let maxY = 0;
        for (let i = 0; i < 180; i++) {
            engine.step(1 / 60);
            maxY = Math.max(maxY, posOf(world)[1]);
        }
        (engine as any).setMoveIntent(0, 0);
        // Stepped onto the 0.4 platform (~1.3) at most — no teleport-to-top spikes.
        expect(maxY).toBeLessThan(1.6);
    });
});
