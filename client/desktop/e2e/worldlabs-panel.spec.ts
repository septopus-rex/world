import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// AI-generated-3D-world demo (gallery exhibit ㉑, services/worldlabs — a thin
// gateway over World Labs' Marble World API, docs.worldlabs.ai/api). This
// spec runs ONLY against the mock provider (see playwright.config.ts's
// worldlabs webServer entry — WORLDLABS_PROVIDER defaults to mock): instant,
// offline, zero cost. It proves the real client round-trip AND the persist
// leg (2026-07-17): panel → generate → poll → the service ingests the splat
// into the CAS gateway (7789) → the pedestal's a4 resource is the
// content-addressed `<cid>.<ext>` form (ResourceManager routes the bytes
// through the world's IpfsRouter) → 保存 serializes the exhibit block into the
// DraftStore → after a REAL reload the generated world is still on the
// pedestal, rebuilt from draft row + CAS network tier.

const findCidModule = () => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId === 0xa4 && typeof std.resource === 'string' && /^b[a-z2-7]+\.(ply|spz)$/.test(std.resource)) {
            return std.resource as string;
        }
    }
    return null;
};

const waitSplatRendered = async (page: any, resource: string) => {
    let rendered = false;
    for (let i = 0; i < 30 && !rendered; i++) {
        await stepEngine(page, 10);
        rendered = await page.evaluate((res: string) => {
            const w = (window as any).loader.engine.getWorld();
            let found = false;
            w.renderEngine.sceneInstance.traverse((obj: any) => {
                if (obj.userData?.isSplatInstance && obj.userData?.resourceId === res) found = true;
            });
            return found;
        }, resource);
    }
    return rendered;
};

test('AI 生成世界(World Labs, mock): 生成 → CID 放置 → 保存 → 重载仍在', async ({ page }) => {
    test.setTimeout(180_000);

    // SAFETY GUARD: playwright reuses an already-running 7790 — if that's a
    // leftover REAL-provider session (WORLDLABS_PROVIDER=real), generating here
    // would silently spend Marble credits and wait ~5 real minutes. Refuse.
    const health = await (await fetch('http://127.0.0.1:7790/v0/health')).json() as { provider?: string };
    test.skip(health.provider !== 'mock',
        `worldlabs service on 7790 runs provider '${health.provider}' — refusing to spend real credits in e2e (restart it without WORLDLABS_PROVIDER=real)`);

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

    // The pedestal's live adjunct swapped to the CONTENT-ADDRESSED form: the
    // worldlabs service ingested the splat into the CAS gateway and the
    // resource is `<cid>.<ext>` (real CIDv1 stem), not a mutable service URL.
    const resource = await page.evaluate(findCidModule);
    expect(resource, 'a4 resource is `<cid>.<ext>` (CAS-ingested)').toMatch(/^bafk[a-z2-7]+\.ply$/);

    // And it actually rendered as a real SplatMesh instance pointed at that
    // resource — bytes came through the IpfsRouter's network tier (7789).
    expect(await waitSplatRendered(page, resource!), 'the generated splat rendered on the pedestal').toBe(true);

    // ── persist: 保存到世界 (draft) → reload → still there ────────────────────
    await page.getByTestId('worldlabs-save').click();
    await expect(page.getByTestId('worldlabs-status')).toContainText('已保存到世界');
    // Drain the DraftStore's write-behind queue before tearing the page down.
    await page.evaluate(() => (window as any).loader.engine.getWorld().draftStore.flush());

    await page.reload();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1020], [8, 8, 1.2]));
    // Let the draft-overlaid block stream in, then find the persisted row.
    let persisted: string | null = null;
    for (let i = 0; i < 30 && !persisted; i++) {
        await stepEngine(page, 10);
        persisted = await page.evaluate(findCidModule);
    }
    expect(persisted, 'the `<cid>.<ext>` module row survived the reload (draft)').toBe(resource);
    expect(await waitSplatRendered(page, persisted!), 'and re-rendered from the CAS gateway').toBe(true);

    await page.screenshot({ path: 'test-results/worldlabs-panel-persisted.png' });
});
