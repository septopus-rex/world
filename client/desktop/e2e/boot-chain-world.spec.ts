import { test, expect } from '@playwright/test';

// THE goal of the boot chain: the ROOT loader boots the REAL 3D world.
//   anchor:septopus → septopus.loader (the mobile shell packed as one IIFE +
//   prelude) → shim validates + executes with page authority → the engine boots
//   the pure-data world, with the WORLD CONFIG fetched from the anchor-pinned
//   CID and ASSETS resolved through the gateway (/assets → name index → CAS).
// Everything the player sees came through the chain: no app server involved.

const GW = 'http://127.0.0.1:7789';

test('ROOT loader 启动完整 3D 世界:锚→loader→引擎→出生→行走', async ({ page, request }) => {
    test.setTimeout(180_000);

    // The chain loader must be seeded (publish-chain.sh builds + reseeds).
    const names = await (await request.get(`${GW}/v0/names`)).json();
    test.skip(!names['loader:chain'], 'chain loader not seeded — run: bash deploy/publish-chain.sh');

    await page.goto(`${GW}/boot?name=septopus`);

    // Shim walked the normative steps (integrity + envelope validation).
    await expect(page.locator('#log')).toContainText('envelope OK: septopus.loader v1', { timeout: 15_000 });

    // The REAL world boots: engine + blocks + the mobile chrome.
    await page.waitForFunction(() => {
        const l = (window as any).loader;
        return !!(l && l.engine && l.engine.getWorld() && l.getLoadedBlockCount() > 0);
    }, undefined, { timeout: 90_000 });
    await expect(page.locator('#three_demo canvas').first()).toBeVisible(); // main canvas (+Stats mini-canvases)
    await expect(page.getByTestId('m-joystick')).toBeVisible();
    await expect(page.getByTestId('status-toggle')).toHaveAttribute('aria-label', /normal/i);

    // World config genuinely came from the chain root (loader prelude fetch).
    const viaChain = await page.evaluate(() => !!(window as any).__SEPTOPUS_WORLD_CONFIG_PROMISE__);
    expect(viaChain, 'world config was chain-injected').toBe(true);

    // Deterministic walk: stop the rAF loop, drive intent, step the engine.
    await page.evaluate(() => (window as any).loader.engine.stop());
    await page.evaluate(() => {
        for (let i = 0; i < 90; i++) (window as any).loader.engine.step(1 / 60); // settle/land
    });
    const p0 = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        return [...w.getComponent(pid, 'TransformComponent').position];
    });
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));
    await page.evaluate(() => {
        for (let i = 0; i < 60; i++) (window as any).loader.engine.step(1 / 60);
    });
    const p1 = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        return [...w.getComponent(pid, 'TransformComponent').position];
    });
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    expect(moved, `链上启动的世界里玩家走了 ${moved.toFixed(2)}m`).toBeGreaterThan(0.5);

    // ── Full-System Loader Verification (Mobile ↔ Desktop ↔ SPP 粒子工坊 + Solana Land) ──
    await expect(page.getByTestId('chain-system-bar')).toBeVisible();

    // 1. If Solana localnet (:8899) is online, LandPanel is active right inside the chain-booted world.
    const solanaUp = await request.post('http://127.0.0.1:8899', {
        data: { jsonrpc: '2.0', id: 1, method: 'getHealth' },
    }).then((r) => r.ok()).catch(() => false);
    if (solanaUp) {
        await expect(page.getByTestId('land-toggle')).toBeVisible({ timeout: 10_000 });
        await page.getByTestId('land-toggle').click();
        await expect(page.getByTestId('land-panel')).toBeVisible();
        await page.getByTestId('land-connect').click();
        await expect(page.getByTestId('land-wallet')).toBeVisible({ timeout: 20_000 });
    }

    // 2. 0ms hot-swap from Mobile shell → Desktop shell over the SAME #three_demo WebGL engine.
    await page.getByTestId('chain-shell-desktop').click();
    await expect(page.getByTestId('app-version')).toBeVisible();
    await expect(page.getByTestId('enter-sandbox')).toBeVisible();
    await expect(page.locator('#three_demo canvas').first()).toBeVisible();

    // 3. Switch to SPP 粒子工坊 (Editor 2), create a new StylePack ('new-1'), and publish its CID to IPFS CAS.
    await page.getByTestId('chain-shell-editor').click();
    await expect(page.getByTestId('sp-editor')).toBeVisible();
    await page.waitForFunction(() => !!(window as any).spLoader?.getEngine?.()?.getWorld?.(), undefined, { timeout: 30_000 });
    await page.getByTestId('sp-new-pack').click();
    await page.getByTestId('sp-acc-store').click();
    await page.getByTestId('sp-publish').click();
    const cidText = await page.getByTestId('sp-cid-store').textContent({ timeout: 10_000 });
    const packCid = cidText?.replace(/^CID:\s*/, '').trim() ?? '';
    expect(packCid).toMatch(/^bafk/);
    const gatewayPack = await (await request.get(`${GW}/ipfs/${packCid}`)).json();
    expect(gatewayPack.id).toBe('new-1');

    // 4. Switch back to Desktop 3D World → open SPP 魔法球 sandbox → 'new-1' is live in the world style switcher.
    await page.getByTestId('chain-shell-desktop').click();
    await page.getByTestId('enter-sandbox').click();
    await expect(page.getByTestId('sandbox-bar')).toBeVisible();
    await expect(page.getByTestId('spp-style-new-1')).toBeVisible();
    await page.getByTestId('exit-sandbox').click();

    // 5. Switch back to Mobile shell so the final screenshot shows the default chain-booted world.
    await page.getByTestId('chain-shell-mobile').click();
    await expect(page.getByTestId('m-joystick')).toBeVisible();

    await page.screenshot({ path: 'test-results/boot-chain-world.png' });
});
