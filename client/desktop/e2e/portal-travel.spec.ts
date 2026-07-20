import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Teleport & portals (specs/teleport-portal.md): map fast-travel goes through
// the SAME anchor-gated action a content portal fires. This drives the real
// client: draft a far block carrying two anchors (one open, one permission-
// gated), discover it on the 2D map, and prove that seeing an anchor on the
// map does NOT bypass its destination-side `when`.

const DEST: [number, number] = [2052, 2048];   // 4 blocks east — outside the 5×5 stream

const playerBlock = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(pid, 'TransformComponent');
    return [Math.floor(t.position[0] / 16) + 1, Math.floor(-t.position[2] / 16) + 1];
});

test('地图快速旅行:锚点标记 → 门控拒绝 → 开放锚点传送', async ({ page }) => {
    test.setTimeout(240_000);
    await bootDeterministic(page);

    // Author a far block with two teleport anchors (b8 slot 6) as a local draft —
    // the map and the teleport resolver both read the draft-overlaid source.
    await page.evaluate(([bx, by]: any) => {
        const w = (window as any).loader.engine.getWorld();
        const raw = [0, 1, [[0x00b8, [
            [[2, 2, 2], [4, 4, 1], [0, 0, 0], 1, 0, [], { name: 'e2e-pad' }],
            [[2, 2, 2], [12, 12, 1], [0, 0, 0], 1, 0, [], { name: 'e2e-vault', when: { var: 'flags.attuned' } }],
        ]]], [], 0];
        return w.draftStore.save(0, bx, by, raw);
    }, DEST);

    // Open the 2D map and let the viewport stream the destination cell.
    await page.locator('[data-testid="map2d-toggle"]').click();
    await expect(page.locator('[data-testid="map2d-canvas"]')).toBeVisible();
    // The map is a PAGE on the shared stack, and its surface animates in — wait
    // for it to settle before measuring the canvas, or the hit coordinates below
    // aim at a moving target.
    await page.waitForSelector('[data-testid="page-surface"][data-settled="1"]');
    await page.waitForFunction(() => ((window as any).__map2d?.loaded ?? 0) > 20, undefined, { timeout: 20_000 });

    // Click the destination cell (map opens centred on the player's block at
    // 20 px/cell → [2052,2048] sits 80 px east of centre).
    const box = await page.locator('[data-testid="map2d-canvas"]').boundingBox();
    // Clicking a cell PUSHES its detail page onto the stack (the map stays
    // mounted underneath it) — the anchors live there.
    await page.mouse.click(box!.x + box!.width / 2 + 4 * 20, box!.y + box!.height / 2);
    await expect(page.locator('[data-testid="block-detail"]')).toBeVisible();
    await expect(page.locator('[data-testid="map2d-travel-e2e-pad"]'), 'anchor discovered on the map').toBeVisible();

    // Gated anchor first: the map shows it, but the destination refuses — the
    // stack stays up and the player has not moved.
    await page.locator('[data-testid="map2d-travel-e2e-vault"]').click();
    await stepEngine(page, 10);
    expect(await playerBlock(page), 'refused: still home').toEqual([2048, 2048]);
    await expect(page.locator('[data-testid="page-host"]'), 'pages still open after denial').toBeVisible();

    // Open anchor: teleport lands the player in the destination block and the
    // map closes on teleport.done.
    await page.locator('[data-testid="map2d-travel-e2e-pad"]').click();
    await stepEngine(page, 20);
    expect(await playerBlock(page), 'fast-travelled').toEqual(DEST);
    await expect(page.locator('[data-testid="map2d"]')).toHaveCount(0);

    // The block streams in around the arrival; the pad anchor sits at [4,4].
    await stepEngine(page, 60);
    const pos = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const t = w.getComponent(pid, 'TransformComponent');
        return [t.position[0] - (2052 - 1) * 16, -t.position[2] - (2048 - 1) * 16];
    });
    expect(pos[0]).toBeGreaterThan(3);
    expect(pos[0]).toBeLessThan(5);

    // eslint-disable-next-line no-console
    console.log('PORTAL-TRAVEL', JSON.stringify({ landed: pos }));
});
