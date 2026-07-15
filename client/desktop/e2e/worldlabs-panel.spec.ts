import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// AI-generated-3D-world demo (gallery exhibit ㉑, services/worldlabs — a thin
// gateway over World Labs' Marble World API, docs.worldlabs.ai/api). This
// spec runs ONLY against the mock provider (see playwright.config.ts's
// worldlabs webServer entry — WORLDLABS_PROVIDER defaults to mock): instant,
// offline, zero cost. It proves the real client round-trip: panel → generate
// → poll → ResourceManager.getModel's direct-URL bypass places a freshly
// "generated" splat on the exhibit's pedestal as a live a4 module entity.

test('AI 生成世界(World Labs, mock provider): 生成 → 轮询 → 放到画廊㉑展台', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);

    // Stand inside the ㉑ exhibit block so WorldLabsAuthoring finds its
    // BlockComponent loaded when it tries to place the result.
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1020], [8, 8, 1.2]));
    await stepEngine(page, 30);

    await page.getByTestId('worldlabs-toggle').click();
    await page.getByTestId('worldlabs-input').fill('a mystical forest with glowing mushrooms');
    await page.getByTestId('worldlabs-send').click();

    // Mock provider completes on the FIRST poll — no real 5-minute wait — but
    // the panel still goes through its normal setInterval polling loop.
    await expect(page.getByTestId('worldlabs-status'), 'placed automatically (block was loaded)')
        .toContainText('已生成并放到画廊㉑展台', { timeout: 30_000 });
    await expect(page.getByTestId('worldlabs-place')).toHaveCount(0); // no manual retry needed
    await expect(page.getByTestId('worldlabs-error')).toHaveCount(0);

    // The pedestal's live adjunct really did swap to a fresh, absolute
    // worldlabs-service URL (not the id-39 placeholder it started as).
    const resource = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
            const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
            if (std?.typeId === 0xa4 && typeof std.resource === 'string' && std.resource.includes('/assets/generated/')) {
                return std.resource as string;
            }
        }
        return null;
    });
    expect(resource).toMatch(/^http:\/\/127\.0\.0\.1:7790\/assets\/generated\/.*\.ply$/);

    // And it actually rendered as a real SplatMesh instance pointed at that
    // resource (same verification tier as splat-module.spec.ts).
    let rendered = false;
    for (let i = 0; i < 30 && !rendered; i++) {
        await stepEngine(page, 10);
        rendered = await page.evaluate((res) => {
            const w = (window as any).loader.engine.getWorld();
            let found = false;
            w.renderEngine.sceneInstance.traverse((obj: any) => {
                if (obj.userData?.isSplatInstance && obj.userData?.resourceId === res) found = true;
            });
            return found;
        }, resource);
    }
    expect(rendered, 'the generated splat actually rendered on the pedestal').toBe(true);

    await page.screenshot({ path: 'test-results/worldlabs-panel-placed.png' });
});
