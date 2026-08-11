import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The editor's SAFETY NET: author a whole SPP 粒子 through the real UI — create
 * the pack, set its meta, drive every face, do full CRUD on the face options and
 * their parts — then verify the DATA that comes out is exactly what was edited.
 *
 * Three independent witnesses, on purpose:
 *   · `spLoader.pack`  — the document fed to the engine (the live truth)
 *   · the exported JSON — what a creator actually walks away with
 *   · `derivedCount()` — what the expander really built from it
 * A bug that fakes one of them still gets caught by the other two: the UI can
 * look right while the export is stale, or the export can be right while nothing
 * re-expands. Spec: spp-editors.md §3.
 */

const A1 = 0x00a1, A2 = 0x00a2, A4 = 0x00a4, B4 = 0x00b4;

/** The pack currently fed to the preview engine (deep copy across the bridge). */
const livePack = (page: Page): Promise<any> =>
    page.evaluate(() => JSON.parse(JSON.stringify((window as any).spLoader.pack)));
/** The collapse dial: six [state, optionKey] entries. */
const liveDial = (page: Page): Promise<Array<[number, string]>> =>
    page.evaluate(() => JSON.parse(JSON.stringify((window as any).spLoader.faces)));
/** How many derived adjuncts of a type the expander produced. */
const derived = (page: Page, typeId?: number): Promise<number> =>
    page.evaluate((t) => (window as any).spLoader.derivedCount(t), typeId);

/** Download the pack through the real 导出 button and parse it. */
async function exportJson(page: Page): Promise<any> {
    await page.getByTestId('sp-acc-store').click();
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('sp-export').click(),
    ]);
    const path = await dl.path();
    return JSON.parse(readFileSync(path, 'utf8'));
}

async function boot(page: Page) {
    await page.goto('/');
    await expect(page.getByTestId('sp-editor')).toBeVisible();
    await expect(page.getByTestId('sp-preview')).toBeVisible();
    // The harness boots a world async; wait until the first expansion landed.
    await expect.poll(() => derived(page), { timeout: 30_000 }).toBeGreaterThan(0);
}

/**
 * ENSURE a section is open. The header is a toggle and `face` starts open, so a
 * blind click closes it — every later step then fails looking for a control that
 * is simply not rendered. Check first, click only if needed.
 */
async function section(page: Page, id: 'basic' | 'face' | 'store') {
    const body = page.getByTestId(`sp-sec-${id}`);
    if (await body.count() === 0) await page.getByTestId(`sp-acc-${id}`).click();
    await expect(body).toBeVisible();
}

test('author a 粒子 from scratch: meta + option + parts, and the export IS what was edited', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);

    // ── create ───────────────────────────────────────────────────────────────
    await page.getByTestId('sp-new-pack').click();
    let pack = await livePack(page);
    expect(pack.id, 'a fresh pack is minted').toMatch(/^new-\d+$/);
    expect(pack.closed, 'starts with one closed option (solid)').toHaveLength(1);
    expect(pack.open, 'and one open option (empty)').toHaveLength(1);
    expect(pack.closed[0].parts, 'solid is one full-face wall').toHaveLength(1);
    // A blank 粒子 = a solid box: six faces × the one wall part of `solid`.
    await expect.poll(() => derived(page, A1)).toBe(6);

    // ── meta ─────────────────────────────────────────────────────────────────
    await section(page, 'basic');
    await page.getByTestId('sp-name').fill('unit-test-pack');
    await page.getByTestId('sp-thickness').fill('0.35');
    pack = await livePack(page);
    expect(pack.id).toBe('unit-test-pack');
    expect(pack.thickness).toBeCloseTo(0.35, 5);

    // ── compose the `solid` option: wall + box + module + stop ───────────────
    await section(page, 'face');
    await page.getByTestId('sp-face-0').click();      // 顶 Top
    await page.getByTestId('sp-tab-closed').click();  // edit the 挡 pool
    for (const kind of ['box', 'module', 'stop']) await page.getByTestId(`sp-add-${kind}`).click();

    pack = await livePack(page);
    const parts = pack.closed[0].parts;
    expect(parts.map((p: any) => p.type), 'parts appended in click order').toEqual([A1, A2, A4, B4]);
    // Every part starts from the ENGINE's defaults (defaultTailFor), not a copy.
    expect(parts[0].props, 'wall tail = [texture, repeat, animation, stop]').toEqual([0, [1, 1], 0, 1]);
    expect(parts[3].props, 'stop tail = [stopMode, animation]').toEqual([0, null]);
    // The option is shared by all six faces, so each new part multiplies by six.
    await expect.poll(() => derived(page, A2)).toBe(6);
    await expect.poll(() => derived(page, A4)).toBe(6);
    await expect.poll(() => derived(page, B4)).toBe(6);

    // ── tune every unit-frame field of one part ──────────────────────────────
    const FRAME = { u: 0.2, v: 0.15, su: 0.5, sv: 0.45, w: 0.1, sw: 0.3 };
    for (const [f, val] of Object.entries(FRAME)) {
        await page.getByTestId(`sp-part-1-${f}`).fill(String(val));
    }
    pack = await livePack(page);
    for (const [f, val] of Object.entries(FRAME)) {
        expect(pack.closed[0].parts[1][f], `part[1].${f} round-trips`).toBeCloseTo(val, 5);
    }

    // ── delete a part ────────────────────────────────────────────────────────
    await page.getByTestId('sp-part-del-3').click();
    pack = await livePack(page);
    expect(pack.closed[0].parts.map((p: any) => p.type), 'the stop is gone').toEqual([A1, A2, A4]);
    await expect.poll(() => derived(page, B4), 'and its geometry with it').toBe(0);

    // ── the export is the same document, byte for byte ───────────────────────
    const exported = await exportJson(page);
    expect(exported, 'exported JSON === the document driving the preview').toEqual(await livePack(page));
    expect(exported.id).toBe('unit-test-pack');
    expect(exported.thickness).toBeCloseTo(0.35, 5);
    expect(exported.closed[0].parts[1]).toMatchObject(FRAME);
    await page.screenshot({ path: 'test-results/authoring-1-composed.png' });
});

test('face options: add, select, edit, delete — and no face is left pointing at a deleted option', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.getByTestId('sp-new-pack').click();
    await section(page, 'face');
    await page.getByTestId('sp-face-2').click();
    await page.getByTestId('sp-tab-closed').click();

    // ── add two more options; each add points the selected face at the new one ─
    await page.getByTestId('sp-add-variant').click();
    await page.getByTestId('sp-add-wall').click();              // v1 = one wall
    await page.getByTestId('sp-add-variant').click();
    await page.getByTestId('sp-add-ball').click();              // v2 = one ball
    let pack = await livePack(page);
    expect(pack.closed.map((v: any) => v.key), 'three options now').toEqual(['solid', 'v1', 'v2']);
    expect((await liveDial(page))[2], 'the edited face follows the newest option').toEqual([1, 'v2']);

    // Faces 0/1/3/4/5 still use `solid`; face 2 uses `v2` (a ball) → 5 walls + 1 ball.
    await expect.poll(() => derived(page, A1)).toBe(5);
    await expect.poll(() => derived(page, 0x00a7)).toBe(1);

    // ── select an existing option (查/改) ─────────────────────────────────────
    await page.getByTestId('sp-variant-1').click();
    expect((await liveDial(page))[2], 'selecting an option repoints the face').toEqual([1, 'v1']);
    await expect.poll(() => derived(page, A1), 'face 2 now renders v1s wall').toBe(6);

    // ── delete the option the face is CURRENTLY using ────────────────────────
    // The dangerous case: a dangling key renders nothing and looks like data loss.
    await page.getByTestId('sp-variant-del-1').click();
    pack = await livePack(page);
    expect(pack.closed.map((v: any) => v.key), 'v1 removed').toEqual(['solid', 'v2']);
    const dial = await liveDial(page);
    expect(dial[2], 'the orphaned face fell back to the first option').toEqual([1, 'solid']);
    for (const [state, key] of dial) {
        const poolKeys = (state === 0 ? pack.open : pack.closed).map((v: any) => v.key);
        expect(poolKeys, 'every face points at an option that exists').toContain(key);
    }
    await expect.poll(() => derived(page, A1), 'all six faces are walls again').toBe(6);

    // ── the last option cannot be deleted (a state with none is dead data) ────
    await page.getByTestId('sp-variant-del-1').click();          // drop v2 → only `solid` left
    expect((await livePack(page)).closed).toHaveLength(1);
    await expect(page.getByTestId('sp-variant-del-0'), 'last option is protected').toBeDisabled();

    // Export agrees with all of it.
    const exported = await exportJson(page);
    expect(exported.closed.map((v: any) => v.key)).toEqual(['solid']);
    await page.screenshot({ path: 'test-results/authoring-2-options.png' });
});

test('per-face collapse: each face can take a different state/option, and the dial is the truth', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.getByTestId('sp-new-pack').click();
    await section(page, 'face');

    // Open the top face (通) — its geometry disappears; the other five stay.
    await page.getByTestId('sp-face-0').click();
    await page.getByTestId('sp-dial-state-open').click();
    expect((await liveDial(page))[0]).toEqual([0, 'empty']);
    await expect.poll(() => derived(page, A1), 'five walls left').toBe(5);

    // Give the 通 pool a real option and put the face on it: an open face that
    // still has geometry (a doorway frame) — the open/closed split is topology,
    // not "has stuff".
    await page.getByTestId('sp-add-variant').click();
    await page.getByTestId('sp-add-box').click();
    expect((await liveDial(page))[0]).toEqual([0, 'v1']);
    await expect.poll(() => derived(page, A2)).toBe(1);

    // Close a second face onto `solid` again → walls back to 5, box still there.
    await page.getByTestId('sp-face-3').click();
    await page.getByTestId('sp-dial-state-closed').click();
    const dial = await liveDial(page);
    expect(dial[0], 'top stays open on v1').toEqual([0, 'v1']);
    expect(dial[3], 'face 3 is closed on solid').toEqual([1, 'solid']);
    await expect.poll(() => derived(page, A1)).toBe(5);
    await expect.poll(() => derived(page, A2)).toBe(1);
    await page.screenshot({ path: 'test-results/authoring-3-dial.png' });
});

test('import: a pasted pack becomes the edited document — panel, preview and export all move', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);

    // A tiny hand-written pack: one closed option with two walls, one open.
    const incoming = {
        format: 'septopus.spp.stylepack', version: 1, id: 'imported-pack', thickness: 0.42,
        closed: [{ key: 'twin', name: 'twin', parts: [
            { type: A1, u: 0, v: 0, su: 0.4, sv: 1, props: [0, [1, 1], 0, 1] },
            { type: A1, u: 0.6, v: 0, su: 0.4, sv: 1, props: [0, [1, 1], 0, 1] },
        ] }],
        open: [{ key: 'void', name: 'void', parts: [] }],
    };
    await section(page, 'store');
    await page.getByTestId('sp-import-text').fill(JSON.stringify(incoming));
    await page.getByTestId('sp-import-btn').click();
    await expect(page.getByTestId('sp-import-error')).toHaveCount(0);

    // The DOCUMENT moved — not just the 3D view. This is the trap the import
    // exists to avoid: applying to the preview engine alone would leave the
    // panel and the export on the old pack while the canvas showed the new one.
    const pack = await livePack(page);
    expect(pack.id).toBe('imported-pack');
    expect(pack.thickness).toBeCloseTo(0.42, 5);
    expect(pack.closed[0].parts).toHaveLength(2);
    // …the preview re-expanded: six faces × two walls.
    await expect.poll(() => derived(page, A1)).toBe(12);
    // …the library shows it, and the export is the same document.
    await section(page, 'basic');
    await expect(page.getByTestId('sp-pack-imported-pack')).toBeVisible();
    expect(await exportJson(page)).toEqual(pack);

    // Malformed input is refused with a reason, and changes nothing.
    await section(page, 'store');
    await page.getByTestId('sp-import-text').fill('{"id":"bad"}');
    await page.getByTestId('sp-import-btn').click();
    await expect(page.getByTestId('sp-import-error')).toContainText('closed');
    expect((await livePack(page)).id, 'a rejected import must not touch the document').toBe('imported-pack');
    await page.screenshot({ path: 'test-results/authoring-4-import.png' });
});

test('contract guard flags objective mistakes, and stays quiet on correct authoring', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);

    // A pack that is wrong in three machine-checkable ways at once.
    const bad = {
        id: 'guard-probe', thickness: 0.2,
        closed: [
            { key: 'hollow', name: 'hollow', parts: [] },                               // blocks nothing
            { key: 'spill', name: 'spill', parts: [{ type: A1, u: 0.5, v: 0, su: 0.9, sv: 1 }] }, // out of cell
        ],
        open: [{ key: 'sealed', name: 'sealed', parts: [{ type: A1, u: 0, v: 0, su: 1, sv: 1 }] }], // cannot pass
    };
    await section(page, 'store');
    await page.getByTestId('sp-import-text').fill(JSON.stringify(bad));
    await page.getByTestId('sp-import-btn').click();
    await section(page, 'face');

    // Face 0 lands on the first closed option (`hollow`).
    await expect(page.getByTestId('sp-guard-closed-empty')).toBeVisible();
    // Switch the face to the second option → the out-of-cell error shows instead.
    await page.getByTestId('sp-variant-1').click();
    await expect(page.getByTestId('sp-guard-part-out-of-cell')).toBeVisible();
    // Flip the face to 通 → the sealed-open warning.
    await page.getByTestId('sp-tab-open').click();
    await expect(page.getByTestId('sp-guard-open-sealed')).toBeVisible();
    await page.screenshot({ path: 'test-results/authoring-5-guard.png' });

    // A correct pack raises nothing at all — the guard must not cry wolf, or
    // authors learn to ignore it.
    const good = {
        id: 'guard-clean', thickness: 0.2,
        closed: [{ key: 'solid', name: 'solid', parts: [{ type: A1, u: 0, v: 0, su: 1, sv: 1 }] }],
        open: [{ key: 'empty', name: 'empty', parts: [] }],
    };
    await section(page, 'store');
    await page.getByTestId('sp-import-text').fill(JSON.stringify(good));
    await page.getByTestId('sp-import-btn').click();
    await section(page, 'face');
    await expect(page.getByTestId('sp-guard')).toHaveCount(0);
    await page.getByTestId('sp-tab-open').click();
    await expect(page.getByTestId('sp-guard')).toHaveCount(0);
});

test('the preview resolves textures — what the editor shows is what the world renders', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);

    // Regression for a stub that made the tool LIE (2026-08-09): the harness's
    // IDataSource.texture() returned {}, so every texture id resolved to
    // nothing. `terran` — whose options reference a detailed armour-panel image
    // — rendered as flat grey boxes in the editor while rendering correctly in
    // the world, and its data got blamed for a tool bug. §3.5's promise is
    // 编辑器所见 = world 所渲; a stub here silently breaks exactly that.
    await section(page, 'basic');
    await page.getByTestId('sp-pack-terran').click();

    const texturedMeshes = () => page.evaluate(() => {
        const w = (window as any).spLoader?.getEngine?.()?.getWorld?.();
        if (!w) return -1;
        let n = 0;
        for (const eid of w.queryEntities('AdjunctComponent', 'MeshComponent')) {
            if (!w.getComponent(eid, 'AdjunctComponent')?.stdData?.derivedFrom) continue;
            let has = false;
            w.getComponent(eid, 'MeshComponent')?.handle?.traverse?.((c: any) => { if (c.material?.map) has = true; });
            if (has) n++;
        }
        return n;
    });
    // Textures load through fetch → CAS → ResourceManager, so poll rather than
    // assert on the first frame.
    await expect.poll(texturedMeshes, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/authoring-6-textured.png' });
});

test('undo/redo covers content edits, and publish is content-addressed', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.getByTestId('sp-new-pack').click();
    await section(page, 'face');
    await page.getByTestId('sp-face-0').click();
    await page.getByTestId('sp-tab-closed').click();

    await page.getByTestId('sp-add-box').click();
    expect((await livePack(page)).closed[0].parts).toHaveLength(2);

    await page.getByTestId('sp-undo').click();
    expect((await livePack(page)).closed[0].parts, 'undo removed the box').toHaveLength(1);
    await expect.poll(() => derived(page, A2)).toBe(0);

    await page.getByTestId('sp-redo').click();
    expect((await livePack(page)).closed[0].parts, 'redo put it back').toHaveLength(2);
    await expect.poll(() => derived(page, A2)).toBe(6);

    // ── publish: same content ⇒ same CID (the whole point of a content address) ─
    await section(page, 'store');
    await page.getByTestId('sp-publish').click();
    await expect(page.getByTestId('sp-cid-store')).toBeVisible();
    const cid1 = (await page.getByTestId('sp-cid-store').textContent())!.replace('CID: ', '').trim();
    expect(cid1.length).toBeGreaterThan(10);

    // Edit → the shown CID is dropped (it no longer describes this document).
    // Asserted on the preview overlay's badge, which does not depend on which
    // accordion section happens to be open.
    await expect(page.getByTestId('sp-cid')).toBeVisible();
    await section(page, 'face');
    await page.getByTestId('sp-add-ball').click();
    await expect(page.getByTestId('sp-cid'), 'a stale CID must not linger').toHaveCount(0);

    // …undo back to the published content and re-publish → the SAME CID.
    await page.getByTestId('sp-undo').click();
    await section(page, 'store');
    await page.getByTestId('sp-publish').click();
    await expect(page.getByTestId('sp-cid-store')).toBeVisible();
    const cid2 = (await page.getByTestId('sp-cid-store').textContent())!.replace('CID: ', '').trim();
    expect(cid2, 'identical content ⇒ identical CID').toBe(cid1);
});

/**
 * MATERIAL · TYPE · KEY — the three things a creator could not express through
 * this UI until 2026-08-09, each of which forced the work out into hand-edited
 * JSON (and, for the key, produced libraries whose options were all called v1).
 *
 * Authored a whole pack through the UI that day and the export came back with
 * `props[0]` stuck at 0 on all twelve parts — a pure white massing model. The
 * palette lives in raw slot 3, so "pick a material" is the single edit that
 * separates a blocked-out shape from something that reads as built.
 */
test('a part carries a material and a type, and an option carries a semantic key', async ({ page }) => {
    await boot(page);
    await page.getByTestId('sp-new-pack').click();
    await section(page, 'face');

    // ── the option's key is editable, and the face reference MOVES with it ────
    await page.getByTestId('sp-variant-key').fill('ice_wall');
    await expect.poll(() => livePack(page).then((p) => p.closed[0].key)).toBe('ice_wall');
    const dial = await liveDial(page);
    expect(dial.filter(([s]) => s === 1).every(([, k]) => k === 'ice_wall'),
        'renaming must re-point every face that used the old key — a dangling ref renders empty').toBe(true);

    // ── slot 3 is editable, per part, and only where slot 3 IS a colour ───────
    await page.getByTestId('sp-part-0-material').selectOption('22');       // Snow
    await expect.poll(() => livePack(page).then((p) => p.closed[0].parts[0].props[0])).toBe(22);

    await page.getByTestId('sp-add-box').click();
    // A freshly dropped part must not arrive already flagged: the placement
    // default used to be sw 0.4 against a guard limit of 0.3.
    await expect(page.getByTestId('sp-guard-part-too-deep'),
        'a just-dropped part must not trip the guard').toHaveCount(0);
    await page.getByTestId('sp-part-1-material').selectOption('14');       // Glass
    await expect.poll(() => livePack(page).then((p) => p.closed[0].parts[1].props[0])).toBe(14);

    // ── swapping the type replaces the raw TAIL, not just the id ─────────────
    const framedAt = (await livePack(page)).closed[0].parts[1].su;
    await page.getByTestId('sp-part-1-type').selectOption(String(A4));
    await expect.poll(() => livePack(page).then((p) => p.closed[0].parts[1].type)).toBe(A4);
    const asModule = (await livePack(page)).closed[0].parts[1];
    expect(asModule.props.length,
        'a4 module carries [resourceId], not the 4-slot standard tail').toBe(1);
    expect(page.getByTestId('sp-part-1-material'),
        'a4 keeps a model id in slot 3 — offering a colour there would corrupt the row').toHaveCount(0);
    expect(asModule.su, 'the frame is the author\'s and must survive a type swap').toBe(framedAt);

    // ── and it all reaches the file the creator walks away with ──────────────
    const out = await exportJson(page);
    expect(out.closed[0].key).toBe('ice_wall');
    expect(out.closed[0].parts[0].props[0]).toBe(22);
    expect(out.color, 'a blank pack must not ship a `color` nothing honours').toBeUndefined();
});
