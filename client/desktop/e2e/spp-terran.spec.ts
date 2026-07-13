import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine, walkUntil } from './helpers';

// The terran StylePack (SC1 human-residence style) — first TEXTURED SPP theme,
// riding the `parts` composition path (face variants emit a2 boxes with a
// texture slot; a1 walls cannot carry textures). Two proofs, both in the real
// renderer: (1) the gallery ⑫ residence streams in as textured derived boxes
// and its south door is genuinely walkable into the interior; (2) the sandbox
// style switcher grows a `terran` button and live-reskins the cells to
// textured boxes (parts pack ↔ setStyleOverride interplay).

/** Census the terran-derived a2 boxes of a block: [count, byTexture]. */
const terranCensus = (page: any, tag: string) => page.evaluate((t: string) => {
    const w = (window as any).loader.engine.getWorld();
    const byTex: Record<string, number> = {};
    let count = 0;
    for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
        const a = w.getComponent(e, 'AdjunctComponent');
        if (a?.stdData?.typeId !== 0x00a2 || !a?.stdData?.derivedFrom) continue;
        if (!String(a?.adjunctId).includes(t)) continue;
        const tx = a?.stdData?.material?.texture;
        if (tx == null) continue;
        count++;
        byTex[tx] = (byTex[tx] ?? 0) + 1;
    }
    return { count, byTex };
}, tag);

const loc = (page: any) => page.evaluate(() => (window as any).loader.engine.getPlayerSeptopusLocation());

test('人族住宅(gallery ⑫):贴图墙体流入 → 南门走进室内', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);

    // Approach from the south — the residence door (room A) is at local y=11.5.
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1011], [3.2, 7.5, 1.2]));
    await stepEngine(page, 60);

    // Streaming + expansion: wait for the terran-derived textured boxes.
    let census: any = { count: 0, byTex: {} };
    for (let i = 0; i < 40 && census.count < 20; i++) {
        await stepEngine(page, 15);
        census = await terranCensus(page, '2000_1011');
    }
    expect(census.count, `textured terran boxes derived (${JSON.stringify(census.byTex)})`).toBeGreaterThan(20);
    expect(census.byTex['36'], 'armored wall plates').toBeGreaterThan(10);
    expect(census.byTex['37'], 'roof/floor deck plates').toBeGreaterThanOrEqual(4);
    expect(census.byTex['38'], 'hazard door header').toBeGreaterThanOrEqual(1);

    // Let async texture loads land, then shoot the whole facade from a corner
    // vantage (the door approach at 4 m is too close to frame the tower).
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1011], [7.5, 2.0, 1.2]));
    for (let i = 0; i < 10; i++) { await stepEngine(page, 6); await page.waitForTimeout(200); }
    await page.screenshot({ path: 'test-results/terran-0-facade.png' });
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1011], [3.2, 7.5, 1.2]));
    await stepEngine(page, 30);

    // Walk north through the doorway — proves the opening is real geometry-free
    // collision space, not just a texture of a door.
    const inside = await walkUntil(page, [0, 1], async () => (await loc(page)).position[1] > 12.6, 900);
    expect(inside, 'walked through the south door into room A').toBe(true);

    // Interior: keep walking east into room B (A↔R open face) to prove the
    // two rooms connect.
    const inB = await walkUntil(page, [1, 0.2], async () => (await loc(page)).position[0] > 5.6, 900);
    await stepEngine(page, 30);
    await page.screenshot({ path: 'test-results/terran-1-interior.png' });
    expect(inB, 'crossed the open interior face into room B').toBe(true);
});

test('SPP 沙盘:风格切换器长出 terran 钮 → 活体换皮成贴图盒', async ({ page }) => {
    test.setTimeout(240_000);
    await bootDeterministic(page); // demo court — sandbox lives at [2047,2049]
    await page.getByTestId('enter-sandbox').click();
    // Sandbox teleports the player; pump until the sandbox b6 expands.
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
        await stepEngine(page, 15);
        ready = await page.evaluate(() => {
            const w = (window as any).loader.engine.getWorld();
            for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
                const a = w.getComponent(e, 'AdjunctComponent');
                if (a?.stdData?.typeId === 0x00b6 && String(a?.adjunctId).includes('2047_2049')) return true;
            }
            return false;
        });
    }
    expect(ready, 'sandbox b6 source loaded').toBe(true);

    const terranBtn = page.getByTestId('spp-style-terran');
    await expect(terranBtn, 'the pack registers → the switcher grows a button').toBeVisible();
    await terranBtn.click();
    await stepEngine(page, 30);

    const census = await terranCensus(page, '2047_2049');
    expect(census.count, 'sandbox cells reskinned to textured terran boxes').toBeGreaterThan(5);
    // Async texture fetch + orbit render frames before the beauty shot.
    for (let i = 0; i < 10; i++) { await stepEngine(page, 6); await page.waitForTimeout(200); }
    await page.screenshot({ path: 'test-results/terran-2-sandbox.png' });

    // Back to basic — the reskin is reversible (override cleared).
    await page.getByTestId('spp-style-basic').click();
    await stepEngine(page, 30);
    const back = await terranCensus(page, '2047_2049');
    expect(back.count, 'basic restores untextured a1 walls').toBe(0);
});
