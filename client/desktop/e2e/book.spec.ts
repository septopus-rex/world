import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The book adjunct (e4) end-to-end in the REAL client: a floating tome sits in
// the demo scene; clicking it (interact.primary → DesktopLoader.openBook) opens
// the in-scene BookReader, which pages a static string[] purely client-side
// (same discipline as e1 link's window.open). Drives forward/back paging, the
// end-clamps, keyboard paging, close, and reopen-resets-to-page-1.

/** Find the book entity (stdData.typeId e4) and click it via the same
 *  interact.primary event the raycaster emits. Returns its page count (-1 if no
 *  book is in the scene). */
const clickBook = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0x00e4) continue;
        w.events.emit('interact.primary', { metadata: null, distance: 2, point: [0, 0, 0] }, { target: eid, actor: pid });
        return Array.isArray(std.pages) ? std.pages.length : 0;
    }
    return -1;
});

const indicator = (page: any) => page.getByTestId('book-page-indicator').innerText();

test('书本(e4):点开 → 翻页 → 端点钳制 → 键盘翻页 → 合上 → 重开归零', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    const panel = page.getByTestId('book-panel');
    await expect(panel, 'reader is closed until the book is clicked').toHaveCount(0);

    // ── click the tome → reader opens on page 1 ──────────────────────────────
    const total = await clickBook(page);
    expect(total, 'a book adjunct exists in the demo scene').toBeGreaterThan(1);
    await stepEngine(page, 3); // let the interact.primary boundary callback fire

    await expect(panel, 'reader opened on click').toBeVisible();
    await expect(page.getByTestId('book-title')).toContainText('八爪');
    await expect(page.getByTestId('book-page-indicator')).toHaveText(`1 / ${total}`);
    // On the first page, "previous" is clamped off; "next" is live.
    await expect(page.getByTestId('book-prev')).toBeDisabled();
    await expect(page.getByTestId('book-next')).toBeEnabled();

    const p1 = await page.getByTestId('book-page-text').innerText();

    // ── page forward: text changes, indicator advances ───────────────────────
    await page.getByTestId('book-next').click();
    await expect(page.getByTestId('book-page-indicator')).toHaveText(`2 / ${total}`);
    const p2 = await page.getByTestId('book-page-text').innerText();
    expect(p2, 'the page turned to different text').not.toBe(p1);
    await expect(page.getByTestId('book-prev'), 'back is live off page 1').toBeEnabled();

    // ── page back: returns to page 1 exactly ─────────────────────────────────
    await page.getByTestId('book-prev').click();
    await expect(page.getByTestId('book-page-indicator')).toHaveText(`1 / ${total}`);
    expect(await page.getByTestId('book-page-text').innerText(), 'back to page 1').toBe(p1);

    // ── keyboard paging (ArrowRight) — a real reader affordance ───────────────
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('book-page-indicator')).toHaveText(`2 / ${total}`);

    // ── run to the last page: "next" clamps off, no wrap ─────────────────────
    for (let i = 2; i < total; i++) await page.getByTestId('book-next').click();
    await expect(page.getByTestId('book-page-indicator')).toHaveText(`${total} / ${total}`);
    await expect(page.getByTestId('book-next'), 'next clamped on the last page').toBeDisabled();
    await expect(page.getByTestId('book-prev')).toBeEnabled();

    await page.screenshot({ path: 'e2e/__screenshots__/book-last-page.png' });

    // ── close, then reopen: the reader resets to page 1 (fresh read) ─────────
    await page.getByTestId('book-close').click();
    await expect(panel, 'reader closed').toHaveCount(0);

    await clickBook(page);
    await stepEngine(page, 3);
    await expect(panel, 'reopened').toBeVisible();
    await expect(page.getByTestId('book-page-indicator'), 'reopen starts at page 1').toHaveText(`1 / ${total}`);

    // ── Escape closes ────────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await expect(panel, 'Escape closed the reader').toHaveCount(0);

    // eslint-disable-next-line no-console
    console.log('BOOK-E2E', JSON.stringify({ total }));
});
