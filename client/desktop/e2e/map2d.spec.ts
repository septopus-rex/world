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
    // The map is a PAGE on the shared stack, and its surface animates in — wait
    // for it to settle before measuring the canvas, or the hit coordinates below
    // aim at a moving target.
    await page.waitForSelector('[data-testid="page-surface"][data-settled="1"]');

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

    // Select: click a block (no drag) → its DETAIL PAGE is pushed onto the stack.
    await page.mouse.click(cx + 30, cy - 20);
    await expect(page.locator('[data-testid="block-detail"]')).toBeVisible();
    await expect(page.locator('[data-testid="page-host"]')).toHaveAttribute('data-depth', '2');
    // The map stays MOUNTED underneath — buried, not unmounted, which is what
    // preserves its pan/zoom and streamed cells across the round trip.
    await expect(page.locator(map())).toHaveCount(1);
    await expect(page.locator(map())).toBeHidden();

    // Third level: block detail → raw data, then two steps back to the map.
    await page.locator('[data-testid="block-detail-raw"]').click();
    await expect(page.locator('[data-testid="block-raw"]')).toBeVisible();
    await expect(page.locator('[data-testid="page-host"]')).toHaveAttribute('data-depth', '3');
    await page.locator('[data-testid="page-back"]').click();
    await expect(page.locator('[data-testid="block-detail"]')).toBeVisible();

    // Back to the map: the viewport survived the trip (no refetch, no re-centre).
    const buried = await map2dState(page);
    await page.locator('[data-testid="page-back"]').click();
    await expect(page.locator(map())).toBeVisible();
    const returned = await map2dState(page);
    expect(returned.center.x, 'pan survived the sub-page').toBe(buried.center.x);
    expect(returned.cell, 'zoom survived the sub-page').toBe(buried.cell);

    // Reset re-centres on the player's block.
    const pblock = await page.evaluate(() => (window as any).loader.playerState.block);
    await page.locator('[data-testid="map2d-reset"]').click();
    await page.waitForTimeout(200);
    const reset = await map2dState(page);
    expect(Math.round(reset.center.x - 0.5)).toBe(pblock[0]);
    expect(Math.round(reset.center.y - 0.5)).toBe(pblock[1]);

    // Close dismisses the whole stack.
    await page.locator('[data-testid="page-close"]').click();
    await expect(page.locator(map())).toHaveCount(0);
    await expect(page.locator('[data-testid="page-host"]')).toHaveCount(0);
});
