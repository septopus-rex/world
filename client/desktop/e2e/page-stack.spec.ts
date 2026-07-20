import { test, expect } from '@playwright/test';
import { bootDeterministic, playerPosition, stepEngine } from './helpers';

// The shared 2D page stack (client/core/src/components/page): one surface over
// the 3D world, pages push/pop inside it. The map exercises navigation depth in
// map2d.spec.ts; this covers the stack's OWN contract — gestures and the
// in-page confirm that replaced window.confirm (a native dialog is forbidden on
// any user path, blocks the rAF loop, and cannot be driven from here at all).

test('page stack: gestures dismiss by level, and confirm resolves in-page', async ({ page }) => {
    test.setTimeout(60_000);
    await bootDeterministic(page);

    // ── Esc pops ONE level; the scrim dismisses the whole stack ──────────────
    await page.locator('[data-testid="map2d-toggle"]').click();
    await page.waitForSelector('[data-testid="page-surface"][data-settled="1"]');
    await expect(page.locator('[data-testid="page-host"]')).toHaveAttribute('data-depth', '1');

    // Keys do not leak to the engine while a page is up: the engine listens on
    // `document`, so an unguarded W would walk the player behind the map.
    // Driven by step(dt), since bootDeterministic stopped the rAF loop — a wall
    // -clock wait would pass here whether the guard works or not.
    const before = await playerPosition(page);
    await page.keyboard.down('w');
    await stepEngine(page, 30);
    await page.keyboard.up('w');
    const after = await playerPosition(page);
    expect(Math.hypot(after[0] - before[0], after[2] - before[2]), 'W did not reach the engine').toBeLessThan(0.05);

    const box = await page.locator('[data-testid="map2d-canvas"]').boundingBox();
    await page.mouse.click(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2);
    await expect(page.locator('[data-testid="page-host"]')).toHaveAttribute('data-depth', '2');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="page-host"]'), 'Esc = one level back').toHaveAttribute('data-depth', '1');

    await page.locator('[data-testid="page-scrim"]').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('[data-testid="page-host"]'), 'scrim = dismiss all').toHaveCount(0);

    // ── in-page confirm: cancel resolves false, and the world is untouched ───
    await page.locator('[data-testid="reset-state"]').click();
    await expect(page.locator('[data-testid="page-confirm"]')).toBeVisible();
    await page.locator('[data-testid="page-confirm-cancel"]').click();
    await expect(page.locator('[data-testid="page-host"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="map2d-toggle"]'), 'app alive, nothing reset').toBeVisible();

    // Dismissing without answering is also a "no" — the promise must resolve, or
    // the caller would hang forever on a scrim tap.
    await page.locator('[data-testid="reset-state"]').click();
    await expect(page.locator('[data-testid="page-confirm"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="page-host"]')).toHaveCount(0);
});
