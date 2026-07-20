import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// The multi-block parkour in the real browser (?level=parkour): the course spans
// 6 blocks northward, so running it exercises DYNAMIC BLOCK STREAMING — a far
// block that is NOT loaded at spawn streams in as the player approaches — and a
// real jump gap. Driven by real movement (hold forward + periodic jumps); jump
// overshoot lands on the continuous course, so it converges to the finish.

async function faceNorth(page: any) {
    await page.evaluate(() => {
        (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(-0.2, 0, 0);
    });
    await stepEngine(page, 2);
}

/** Is block (bx,by) currently materialized in the world? */
const blockLoaded = (page: any, bx: number, by: number) => page.evaluate(([x, y]: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    return w.queryEntities('BlockComponent').some((e: number) => {
        const b = w.getComponent(e, 'BlockComponent');
        return b && b.x === x && b.y === y;
    });
}, [bx, by]);

/** The player's current block northing (by). engine Z = -((by-1)*16 + N). */
const playerBy = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const z = w.getComponent(pid, 'TransformComponent').position[2];
    return Math.floor(-z / 16) + 1;
});

const complete = (page: any) => page.evaluate(() => (window as any).loader.levelComplete);

/** Absolute northing in metres — the single number that says "did we get further". */
const northAbs = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return -w.getComponent(pid, 'TransformComponent').position[2];
});

/** Walk with `intent`, jumping on a cadence, and RE-TIME the jump when progress
 *  stalls. Steps in chunks so async block streaming lands between them.
 *
 *  The re-timing is the load-bearing part. Running at a fixed speed and jumping
 *  on a fixed cadence makes the landing points deterministic and evenly spaced
 *  (~3.9 m per leap) — and one of them can fall exactly inside the course's only
 *  gap (block 2050, n 7–9), at which point the run loops forever between the
 *  checkpoint and the hole. That is the fixture's fault, not the engine's: a
 *  blind metronome is not how anyone runs a parkour course. So when the player
 *  stops gaining northing, shift the jump phase and try again — the way a player
 *  re-times a leap they just missed. Converges regardless of how the course,
 *  the run speed or the jump impulse are later tuned. */
async function walkJumpUntil(page: any, intent: [number, number], done: () => Promise<boolean>, maxSteps: number) {
    await page.evaluate(([x, y]: number[]) => (window as any).loader.setPlayerMoveIntent(x, y), intent);
    let ok = false, every = 2, best = -Infinity, stale = 0, i = 0;
    for (let s = 0; s < maxSteps && !ok; s += 10, i++) {
        if (i % every === 0) await page.evaluate(() => (window as any).loader.triggerPlayerJump());
        await stepEngine(page, 10);
        ok = await done();
        const n = await northAbs(page);
        if (n > best + 0.5) { best = n; stale = 0; }
        // Vary the CADENCE, not merely its phase: the jump is buffered, so a
        // trigger issued mid-air simply fires on landing — shifting the phase
        // inside one cadence changes nothing. A different cadence does, because
        // it changes whether a trigger is still pending when the player lands.
        else if (++stale >= 15) { every = 2 + ((every - 1) % 4); stale = 0; }
    }
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    return ok;
}

test('parkour streams blocks as you run north and reaches the finish', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=parkour');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60); // settle on the start platform

    await expect(page.locator('[data-testid="parkour-timer"]')).toBeVisible();
    expect(await playerBy(page)).toBe(2048);
    // The far finish block is NOT loaded at spawn (beyond the 5-block window).
    expect(await blockLoaded(page, 2048, 2053)).toBe(false);

    await faceNorth(page);
    const finished = await walkJumpUntil(page, [0, 1], () => complete(page), 2000);
    expect(finished, 'ran north across the blocks to the finish').toBe(true);

    // It streamed in as the player ran north, and the player ended up far north.
    expect(await blockLoaded(page, 2048, 2053), 'finish block streamed in').toBe(true);
    expect(await playerBy(page)).toBeGreaterThan(2050);
    await expect(page.locator('[data-testid="parkour-complete"]')).toBeVisible();

    // The first finish is a new record, and the best time is persisted.
    await expect(page.locator('[data-testid="parkour-record"]')).toBeVisible();
    expect(await page.evaluate(() => (window as any).loader.parkourBest)).toBeGreaterThan(0);
});
