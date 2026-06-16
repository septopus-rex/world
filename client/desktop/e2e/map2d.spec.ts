import { test, expect } from '@playwright/test';
import { bootDeterministic } from './helpers';

// 2D world map: a pure render-layer feature reusing the block data source. Opens
// a pannable canvas map that DYNAMICALLY LOADS the visible region (loader.fetchMapCell),
// with pan / zoom / select — the old engine's render_2d/control_2d, modernized.

const map = () => '[data-testid="map2d"]';

async function map2dState(page: any) {
    return page.evaluate(() => (window as any).__map2d);
}

test('2D map opens, dynamically loads the region, and pans/zooms/selects', async ({ page }) => {
    test.setTimeout(60_000);
    await bootDeterministic(page);

    // Open the map from the toggle.
    await page.locator('[data-testid="map2d-toggle"]').click();
    await expect(page.locator(map())).toBeVisible();
    await expect(page.locator('[data-testid="map2d-canvas"]')).toBeVisible();

    // Dynamic region load: the viewport drives fetching — cells appear without the
    // player being there.
    await page.waitForFunction(() => ((window as any).__map2d?.loaded ?? 0) > 0, undefined, { timeout: 15_000 });
    const before = await map2dState(page);
    expect(before.loaded).toBeGreaterThan(0);

    const box = await page.locator('[data-testid="map2d-canvas"]').boundingBox();
    if (!box) throw new Error('no canvas box');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    // Pan: drag the map — the viewport centre moves (and more region loads).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 160, cy + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const panned = await map2dState(page);
    expect(Math.abs(panned.center.x - before.center.x), 'pan moved the viewport east').toBeGreaterThan(2);
    expect(Math.abs(panned.center.y - before.center.y), 'pan moved the viewport south').toBeGreaterThan(1);

    // Zoom: wheel changes the cell size (cursor-anchored).
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    const zoomed = await map2dState(page);
    expect(zoomed.cell, 'wheel up zoomed in').toBeGreaterThan(panned.cell);

    // Select: click a block (no drag) → inspect panel.
    await page.mouse.click(cx + 30, cy - 20);
    await expect(page.locator('[data-testid="map2d-inspect"]')).toBeVisible();

    // Reset re-centres on the player's block.
    const pblock = await page.evaluate(() => (window as any).loader.playerState.block);
    await page.locator('[data-testid="map2d-reset"]').click();
    await page.waitForTimeout(200);
    const reset = await map2dState(page);
    expect(Math.round(reset.center.x - 0.5)).toBe(pblock[0]);
    expect(Math.round(reset.center.y - 0.5)).toBe(pblock[1]);

    // Close.
    await page.locator('[data-testid="map2d-close"]').click();
    await expect(page.locator(map())).toHaveCount(0);
});
