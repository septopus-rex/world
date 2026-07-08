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
    await expect(page.getByTestId('m-mode')).toHaveText(/normal/i);

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

    await page.screenshot({ path: 'test-results/boot-chain-world.png' });
});
