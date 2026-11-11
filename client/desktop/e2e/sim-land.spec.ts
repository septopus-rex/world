import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// End-to-end verification of the wallet-free 10-SOL simulated land mode:
//   1. `services/land-sim` (:7792) grants 10 SOL on first connect (no wallet plugin)
//   2. `plugin-sim.ts` (`SEPTOPUS_LAND=sim`) drives mint → 3D publish (IPFS :7789) → list
//   3. Multi-account settlement + 2D Map (`WorldMap2D` + `BlockDetailPage`) remote
//      inspection, buying, claiming, and fast-jump to owned plot.

test('免钱包 10 SOL 模拟链 + 2D 地图选地交易全链路: 领 10 SOL → 认领改地发布 → 挂单 → 切号在 2D 地图买地与认领 → 卖家收款核验', async ({ page }) => {
    test.setTimeout(180_000);

    await bootDeterministic(page);
    const snap0 = await page.evaluate(() => (window as any).loader?.landSnapshot?.() ?? null);
    test.skip(!snap0?.enabled || snap0.chain !== 'sim', 'client not started with SEPTOPUS_LAND=sim');

    // Clear any leftover sim wallet secrets in this browser context so Alice & Bob start fresh at 10 SOL.
    await page.evaluate(async () => {
        localStorage.removeItem('septopus.land.sim.slot');
        localStorage.removeItem('septopus.land.sim.secret');
        localStorage.removeItem('septopus.land.sim.secret.2');
        localStorage.removeItem('septopus.land.sim.secret.3');
        await (window as any).loader.landDisconnect();
    });

    // Pick unique coordinates far from authored demo blocks so every run starts unminted.
    const bx = 3200 + Math.floor((Date.now() / 1000) % 700);
    const by = 3200 + Math.floor(Math.random() * 700);

    await page.evaluate(async ([x, y]) => {
        const l = (window as any).loader;
        l.teleportSeptopus([x, y], [8, 8, 2]);
        await l.landRefresh();
    }, [bx, by]);
    await stepEngine(page, 20);

    // 1. Unminted block refuses Edit mode.
    await expect(page.getByTestId('land-coord')).toHaveText(`[${bx}, ${by}]`);
    await expect(page.getByTestId('land-status-pill')).toContainText('UNMINTED');
    expect(await page.evaluate(() => (window as any).loader.setMode('edit'))).toBe(false);

    // 2. Open LandPanel → Alice activates simulated wallet and receives 10 SOL.
    await page.getByTestId('land-toggle').click();
    await expect(page.getByTestId('land-panel')).toBeVisible();
    await page.getByTestId('land-connect').click();
    await expect(page.getByTestId('land-wallet')).toContainText('10 SOL');

    const aliceSnap = await page.evaluate(() => (window as any).loader.landSnapshot());
    expect(aliceSnap.balance).toBe(10_000_000_000);
    const aliceAddr = aliceSnap.wallet;
    expect(aliceAddr).toBeTruthy();

    // 3. Alice mints [bx, by] (costs 0.1 SOL → 9.9 SOL remaining) and unlocks Edit mode.
    await page.getByTestId('land-mint').click();
    await expect(page.getByTestId('land-status')).toHaveText('owned');
    await expect(page.getByTestId('land-wallet')).toContainText('9.9 SOL');
    expect(await page.evaluate(() => (window as any).loader.canEditBlock())).toBe(true);

    // 4. Alice stamps 3D content onto [bx, by] and publishes to IPFS (:7789) + land-sim (:7792).
    await page.getByTestId('stamp-scene').click();
    await stepEngine(page, 10);
    await expect(page.getByTestId('land-draft')).toContainText('有未上链修改');

    await page.getByTestId('land-publish').click();
    await expect(page.getByTestId('land-cid')).toContainText('bafk');
    await expect(page.getByTestId('land-draft')).toHaveText('无');
    const publishedCid = await page.evaluate(() => (window as any).loader.landSnapshot().block?.cid);
    expect(publishedCid).toMatch(/^bafk[a-z2-7]+$/);

    // 5. Alice lists [bx, by] for 1.5 SOL; while listed, Edit mode is frozen.
    await page.getByTestId('land-list-price').fill('1.5');
    await page.getByTestId('land-list').click();
    await expect(page.getByTestId('land-status')).toHaveText('listed');
    expect(await page.evaluate(() => (window as any).loader.canEditBlock())).toBe(false);

    // 6. Switch to Bob (Slot #2) via the built-in account switcher → Bob starts with 10 SOL!
    //    Move Bob 2 blocks east ([bx + 2, by]) and clear local caches so Bob buys remotely via 2D Map.
    await page.getByTestId('land-switch-account').click();
    await expect(page.getByTestId('land-wallet')).toContainText('10 SOL');
    const bobAddr = await page.evaluate(() => (window as any).loader.landSnapshot().wallet);
    expect(bobAddr).toBeTruthy();
    expect(bobAddr).not.toBe(aliceAddr);

    // Close LandPanel so it doesn't overlap anything, move Bob away, and clear caches.
    await page.getByTestId('land-toggle').click();
    await page.evaluate(async ([x, y]) => {
        const l = (window as any).loader;
        await l.engine.clearDrafts(0);
        l.land.onChainRaw.clear();
        l.land.blocks.clear();
        l.teleportSeptopus([x + 2, y], [8, 8, 2]);
        await l.landRefresh();
    }, [bx, by]);
    await stepEngine(page, 15);

    // 7. Bob opens the 2D Map, sees land legend & synced viewport, and clicks Alice's listed plot [bx, by].
    await page.locator('[data-testid="map2d-toggle"]').click();
    await expect(page.locator('[data-testid="map2d"]')).toBeVisible();
    await page.waitForSelector('[data-testid="page-surface"][data-settled="1"]');
    await page.waitForFunction(() => ((window as any).__map2d?.landSynced ?? 0) > 0, undefined, { timeout: 15_000 });
    await expect(page.locator('[data-testid="map2d"]')).toContainText('挂单在售');

    // Compute exact screen pixel of block [bx, by] on the 2D map canvas (Bob is at [bx + 2, by]).
    const hitPoint = await page.evaluate(([tx, ty]) => {
        const m = (window as any).__map2d;
        const canvas = document.querySelector('[data-testid="map2d-canvas"]') as HTMLCanvasElement;
        const r = canvas.getBoundingClientRect();
        const px = r.left + r.width / 2 + ((tx + 0.5) - m.center.x) * m.cell;
        const py = r.top + r.height / 2 - ((ty + 0.5) - m.center.y) * m.cell;
        return { px, py };
    }, [bx, by]);

    await page.mouse.click(hitPoint.px, hitPoint.py);
    await expect(page.getByTestId('block-detail-land')).toBeVisible();
    await expect(page.getByTestId('block-detail-land-status')).toContainText('listed (1.5 SOL)');
    await page.screenshot({ path: 'test-results/sim-land-map-detail.png' });

    // 8. Bob buys Alice's plot directly from the 2D Map BlockDetailPage!
    await page.getByTestId('block-detail-land-buy').click();
    await expect(page.getByTestId('block-detail-land-status')).toHaveText('owned');
    await expect(page.getByTestId('block-detail-wallet')).toContainText('8.5 SOL');

    // Bob also goes back to the map and claims an adjacent unminted plot [bx + 1, by] from the map.
    await page.locator('[data-testid="page-back"]').click();
    await expect(page.locator('[data-testid="map2d"]')).toBeVisible();
    const adjPoint = await page.evaluate(([tx, ty]) => {
        const m = (window as any).__map2d;
        const canvas = document.querySelector('[data-testid="map2d-canvas"]') as HTMLCanvasElement;
        const r = canvas.getBoundingClientRect();
        return {
            px: r.left + r.width / 2 + ((tx + 0.5) - m.center.x) * m.cell,
            py: r.top + r.height / 2 - ((ty + 0.5) - m.center.y) * m.cell,
        };
    }, [bx + 1, by]);
    await page.mouse.click(adjPoint.px, adjPoint.py);
    await expect(page.getByTestId('block-detail-land-status')).toHaveText('unminted');
    await page.getByTestId('block-detail-land-mint').click();
    await expect(page.getByTestId('block-detail-land-status')).toHaveText('owned');
    await expect(page.getByTestId('block-detail-wallet')).toContainText('8.4 SOL');

    // Jump back to Alice's former plot [bx, by] via map detail and verify Bob sees the 3D content & can edit.
    await page.locator('[data-testid="page-back"]').click();
    await page.mouse.click(hitPoint.px, hitPoint.py);
    await page.getByTestId('block-detail-land-goto').click();
    await stepEngine(page, 20);

    const bobAtBoughtPlot = await page.evaluate(([x, y]) => {
        const l = (window as any).loader;
        const raw = l.content.blockAt(x, y)?.raw;
        return {
            block: l.playerState.block,
            canEdit: l.canEditBlock(),
            adjunctGroups: Array.isArray(raw?.[2]) ? raw[2].length : 0,
        };
    }, [bx, by]);
    expect(bobAtBoughtPlot.block).toEqual([bx, by]);
    expect(bobAtBoughtPlot.canEdit).toBe(true);
    expect(bobAtBoughtPlot.adjunctGroups).toBeGreaterThan(0);

    // 9. Switch back to Alice (#2 → #3 → #1) and verify Alice received the 1.5 SOL sale proceeds (9.9 + 1.5 = 11.4 SOL)!
    await page.getByTestId('land-toggle').click();
    await page.getByTestId('land-switch-account').click(); // #3
    await page.getByTestId('land-switch-account').click(); // #1 (Alice)
    await expect(page.getByTestId('land-wallet')).toContainText('11.4 SOL');
    const aliceFinal = await page.evaluate(() => (window as any).loader.landSnapshot());
    expect(aliceFinal.wallet).toBe(aliceAddr);
    expect(aliceFinal.balance).toBe(11_400_000_000);

    await page.screenshot({ path: 'test-results/sim-land-verified.png' });
});
