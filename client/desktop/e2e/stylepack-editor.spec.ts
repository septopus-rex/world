import { test, expect } from '@playwright/test';

// The standalone SPP粒子 editor (?tool=stylepack), spatial model: a cell whose
// faces are driven by a collapse dial; pick a face → open/close tabs → add
// adjuncts/geometry into that state's option → the preview re-expands live.
// Spec: spp-editors.md §3. Independent of the world app (own lean Engine).

const A1 = 0x00a1, A4 = 0x00a4, B4 = 0x00b4;

async function derived(page: any, typeId: number): Promise<number> {
    return page.evaluate((t: number) => {
        const w = (window as any).spLoader?.getEngine?.()?.getWorld?.();
        if (!w) return -1;
        let n = 0;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (a?.stdData?.derivedFrom && a.stdData.typeId === t) n++;
        }
        return n;
    }, typeId);
}
async function pump(page: any, cond: () => Promise<boolean>, rounds = 80): Promise<boolean> {
    for (let i = 0; i < rounds; i++) { await page.waitForTimeout(150); if (await cond()) return true; }
    return false;
}

test('SPP粒子 editor: cell preview, add a composition to a face state, drive the collapse dial', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?tool=stylepack');
    await expect(page.getByTestId('sp-editor')).toBeVisible();
    await expect(page.getByTestId('sp-preview')).toBeVisible();

    // Default: all 6 faces collapsed to closed/solid → 6 a1 walls (the 粒子 = a box).
    expect(await pump(page, async () => (await derived(page, A1)) >= 6), 'the 粒子 expands 6 solid walls').toBe(true);
    await page.screenshot({ path: 'test-results/sp2-0-box.png' });

    // Pick a face → its close tab → add a model (a4) + a stop (b4) into the solid
    // option (composition, P1). Every face using `solid` now shows the model.
    await page.getByTestId('sp-face-0').click();
    await page.getByTestId('sp-tab-closed').click();
    await page.getByTestId('sp-add-model').click();
    await page.getByTestId('sp-add-stop').click();
    expect(await pump(page, async () => (await derived(page, A4)) >= 6), 'the a4 model composed into the option').toBe(true);
    expect(await derived(page, B4), 'the b4 stop too').toBeGreaterThanOrEqual(6);
    await page.screenshot({ path: 'test-results/sp2-1-composed.png' });

    // Collapse dial: flip one face to 通(open) → that face collapses to the empty
    // open option → one fewer set of face geometry in the preview.
    const a4Before = await derived(page, A4);
    await page.getByTestId('sp-dial-state-1').click(); // face 1 → open
    expect(await pump(page, async () => (await derived(page, A4)) < a4Before), 'flipping a face to open drops its composition').toBe(true);
    await page.screenshot({ path: 'test-results/sp2-2-dialed.png' });
});
