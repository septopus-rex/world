import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine, playerPosition } from './helpers';

// THE GOAL: enter Game mode and ride a roller coaster that was COLLAPSED FROM
// SPP, in the real browser. ?level=coaster serves a b6 'coaster' source; the
// engine collapses it into c1 tube track; clicking GAME mounts the player and
// the CoasterSystem carries them along the rail to the finish.

test('enter Game mode and ride an SPP-collapsed coaster to the finish', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?level=coaster');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 15); // build + collapse the b6 into c1 track

    // The SPP source collapsed into c1 tube track pieces (the visible rail).
    const c1 = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        return w.queryEntities('AdjunctComponent')
            .filter((e: number) => w.getComponent(e, 'AdjunctComponent')?.stdData?.typeId === 0x00c1).length;
    });
    expect(c1, 'b6 coaster collapsed into c1 track pieces').toBeGreaterThanOrEqual(5);

    // Enter Game mode through the real switcher.
    await page.locator('[data-testid="mode-game"]').click();
    await page.waitForFunction(() => (window as any).loader.engine.getWorld().mode === 'game');
    await stepEngine(page, 3); // mount (snap to the rail start)

    // Ride the rail to the end.
    const start = await playerPosition(page);
    await stepEngine(page, 320);
    expect(await page.evaluate(() => (window as any).loader.coasterComplete), 'rode to the finish').toBe(true);

    // The player was genuinely carried along the rail (not sitting at the start).
    const end = await playerPosition(page);
    const moved = Math.hypot(end[0] - start[0], end[2] - start[2]);
    expect(moved, 'carried along the rail').toBeGreaterThan(5);
});
