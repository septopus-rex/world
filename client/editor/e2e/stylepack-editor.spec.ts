import { test, expect } from '@playwright/test';

// The standalone SPP粒子 editor — its OWN app (client/editor, port 7779; it was
// a ?tool=stylepack branch of the desktop shell until 2026-08-05). Spatial
// model: a cell whose faces are driven by a collapse dial; pick a face →
// open/close tabs → add adjuncts/geometry into that state's option → the
// preview re-expands live. Spec: spp-editors.md §3. Independent of the WORLD
// runtime (own lean Engine harness), not of the engine library.

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
    await page.goto('/');   // the editor IS this app's root — no route param
    await expect(page.getByTestId('sp-editor')).toBeVisible();
    await expect(page.getByTestId('sp-preview')).toBeVisible();

    // Default: all 6 faces collapsed to closed/solid → 6 a1 walls (the 粒子 = a box).
    expect(await pump(page, async () => (await derived(page, A1)) >= 6), 'the 粒子 expands 6 solid walls').toBe(true);
    await page.screenshot({ path: 'test-results/sp2-0-box.png' });

    // Pick a face → its close tab → add a model (a4) + a stop (b4) into the solid
    // option (composition, P1). Every face using `solid` now shows the model.
    await page.getByTestId('sp-face-0').click();
    await page.getByTestId('sp-tab-closed').click();
    // The palette is the engine's placement-shaped type set, not a hand-kept 5:
    // types that cannot live in a unit frame (b6 SPP source, c2 motif, a3 light)
    // must NOT appear, and ones that can (a8 sign, e5 board) must.
    await expect(page.getByTestId('sp-add-sign')).toBeVisible();
    await expect(page.getByTestId('sp-add-board')).toBeVisible();
    await expect(page.getByTestId('sp-add-spp')).toHaveCount(0);
    await expect(page.getByTestId('sp-add-motif')).toHaveCount(0);
    await expect(page.getByTestId('sp-add-light')).toHaveCount(0);
    // Part kinds are enumerated from the ENGINE (listOptionPartKinds) — the
    // handle suffix is the lower-cased engine type name, so a4 is 'module'.
    await page.getByTestId('sp-add-module').click();
    await page.getByTestId('sp-add-stop').click();
    expect(await pump(page, async () => (await derived(page, A4)) >= 6), 'the a4 model composed into the option').toBe(true);
    expect(await derived(page, B4), 'the b4 stop too').toBeGreaterThanOrEqual(6);
    await page.screenshot({ path: 'test-results/sp2-1-composed.png' });

    // Collapse dial: flip one face to 通(open) → that face collapses to the empty
    // open option → one fewer set of face geometry in the preview.
    const a4Before = await derived(page, A4);
    await page.getByTestId('sp-face-1').click();          // select face 1 (bottom band)
    await page.getByTestId('sp-dial-state-open').click(); // → 通(open) (top band)
    expect(await pump(page, async () => (await derived(page, A4)) < a4Before), 'flipping a face to open drops its composition').toBe(true);
    await page.screenshot({ path: 'test-results/sp2-2-dialed.png' });
});
