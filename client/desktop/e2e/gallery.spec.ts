import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine, walkUntil } from './helpers';

// The feature gallery (`?level=gallery`): a walkable south→north corridor, one
// engine feature per block, an e4 book at each entrance explaining it. Decomposes
// the crammed demo showcase into legible per-feature exhibits. Drives the REAL
// client: spawn at the south end facing north, confirm the exhibits exist, then
// walk north across a block seam (on-foot streaming) into the next exhibit.

const loc = (page: any) => page.evaluate(() => (window as any).loader.engine.getPlayerSeptopusLocation());

/** Count adjunct entities of a typeId across all loaded blocks (incl. derived). */
const countType = (page: any, typeId: number) => page.evaluate((t: number) => {
    const w = (window as any).loader.engine.getWorld();
    let n = 0;
    for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
        if (w.getComponent(e, 'AdjunctComponent')?.stdData?.typeId === t) n++;
    }
    return n;
}, typeId);

test('功能展厅:出生朝北 → 每格一功能 + 入口书 → 走廊向北串块', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    // ── spawn at the south end of the hall ───────────────────────────────────
    const start = await loc(page);
    expect(start.block, 'spawned at the south end block').toEqual([2000, 1000]);

    // Opening exhibits: ① geometry primitives (cone/ball among the bricks) and
    // ② the soldier NPC (ba) sit in the first two blocks; the entrance books
    // (e4) are present across the loaded neighbourhood. (The b6 SPP hut moved
    // mid-hall to ⑫ [2000,1011] — complex exhibits no longer lead the walk.)
    expect(await countType(page, 0x00a6), '① geometry: the cone exhibit is in the spawn block').toBeGreaterThanOrEqual(1);
    expect(await countType(page, 0x00ba), '② the NPC agent is in the loaded neighbourhood').toBeGreaterThanOrEqual(1);
    expect(await countType(page, 0x00e4), 'entrance books exist in the loaded blocks').toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'test-results/gallery-0-spawn.png' });

    // ── walk NORTH down the hall — spawn faces north, so forward [0,1] = north ─
    // Crossing the block seam proves on-foot streaming of the next exhibit.
    const reached = await walkUntil(page, [0, 1], async () => (await loc(page)).block[1] >= 1001, 1200);
    const after = await loc(page);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 60);
    await page.screenshot({ path: 'test-results/gallery-1-northward.png' });

    expect(reached, `walking forward carried north into the next exhibit block (got ${JSON.stringify(after.block)})`).toBe(true);
    expect(after.block[1], 'advanced at least one block north').toBeGreaterThanOrEqual(1001);
});

test('功能展厅:触发门这一格可以走通(踩垫→门升起→穿过)', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);

    // Fast-travel onto the trigger-door exhibit (block index 3 = [2000,1003]),
    // south edge, then walk north: stepping on the pad raises the wall that bars
    // the lane, and the hall stays traversable (the one intentional gate).
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1003], [8, 2.5, 1.2]));
    await stepEngine(page, 60);
    expect((await loc(page)).block, 'on the trigger-door block').toEqual([2000, 1003]);

    const through = await walkUntil(page, [0, 1], async () => (await loc(page)).block[1] >= 1004, 1500);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 45);
    await page.screenshot({ path: 'test-results/gallery-2-door.png' });
    expect(through, `the pad-opened door let the walk continue north (at ${JSON.stringify((await loc(page)).block)})`).toBe(true);
});
