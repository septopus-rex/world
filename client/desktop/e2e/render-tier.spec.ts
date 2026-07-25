import { test, expect } from '@playwright/test';
import { waitForWorldReady } from './helpers';

/**
 * The render TIER contract (2026-07-25).
 *
 * The rest of the suite runs on the cheap tier — `playwright.config.ts` plants
 * `septopus_fx=low` in localStorage because each extra shader permutation costs
 * SwiftShader seconds of compile time. That makes this file necessary: without
 * it, nothing would ever exercise what a real user actually boots into.
 *
 * So: one spec forces the FULL tier and asserts both expensive features are
 * live, and one asserts the cheap tier really does drop them (otherwise the
 * suite's speed win would be silently lost the day the flag stops being read).
 */

test('the default tier boots with sun shadows AND the sky IBL', async ({ page }) => {
    // `?fx=full` beats the harness's localStorage flag (query param wins).
    await page.goto('/?level=demo&fx=full');
    await waitForWorldReady(page);
    const tier = await page.evaluate(() => {
        const re: any = (window as any).loader.engine.getWorld().renderEngine;
        return { shadows: re.perfInfo().shadows, ...re.skyInfo() };
    });
    expect(tier.shadows, 'shadow map on by default — contact shadows are half the "built" look').toBe(true);
    expect(tier.ibl, 'sky PMREM feeds scene.environment by default').toBe(true);
    // The sky is a real gradient that the fog tracks, not a flat clear colour.
    expect(tier.horizon).toBeGreaterThan(0);
});

test('the harness storageState alone selects the cheap tier (no query param)', async ({ page }) => {
    // THE test that matters for suite runtime: every other spec opens a plain URL
    // and inherits the tier from `septopus_fx` in localStorage. Measured on the
    // demo level under SwiftShader: full tier boots in 18.6 s and takes 17.1 s to
    // step 90 frames; cheap tier, 6.7 s and 0.70 s. If this regresses, specs stop
    // failing on their assertions and start failing on the 90 s timeout instead.
    await page.goto('/?level=demo');
    await waitForWorldReady(page);
    const tier = await page.evaluate(() => {
        const re: any = (window as any).loader.engine.getWorld().renderEngine;
        return { shadows: re.perfInfo().shadows, ...re.skyInfo() };
    });
    expect(tier.shadows, 'playwright.config.ts storageState must reach WorldContent').toBe(false);
    expect(tier.ibl).toBe(false);
});

test('?fx=low drops both (the tier the suite itself runs on)', async ({ page }) => {
    await page.goto('/?level=demo&fx=low');
    await waitForWorldReady(page);
    const tier = await page.evaluate(() => {
        const re: any = (window as any).loader.engine.getWorld().renderEngine;
        return { shadows: re.perfInfo().shadows, ...re.skyInfo() };
    });
    expect(tier.shadows).toBe(false);
    expect(tier.ibl).toBe(false);
    // …but the visible sky and its fog match are NOT a quality tier — they stay.
    expect(tier.horizon).toBeGreaterThan(0);
});
