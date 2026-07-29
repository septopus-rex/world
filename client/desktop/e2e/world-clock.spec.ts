import { test, expect } from '@playwright/test';
import { waitForWorldReady } from './helpers';

/**
 * The in-world clock in the REAL client — the HUD readout, and the thing it was
 * added to answer: "once it gets dark, does it stay dark forever?"
 *
 * The headless twin (engine/tests/integration/day-night-cycle.test.ts) walks a
 * full cycle with `step()` and proves the light comes back. What it CANNOT prove
 * is that the client's own loop advances it: every other test in the suite calls
 * `engine.stop()` and drives `step()` by hand, so a world whose rAF never ran the
 * environment would pass all of them and still be frozen on screen. This one
 * deliberately leaves the engine RUNNING and watches real wall-clock time pass.
 *
 * Rate, and why the threshold below is so slack: `World.runLoop` derives dt from
 * the real frame interval but CLAMPS it at 0.1 s (so a backgrounded tab does not
 * resume with one enormous step). Under SwiftShader this suite runs at a few fps,
 * which means every frame hits that clamp and simulated time advances at a small
 * fraction of wall time — 5 to 8 in-world minutes per 10 real seconds here, versus
 * ~24 on a 60 fps machine, varying run to run with the frame rate. The claim under
 * test is "it advances at all, driven by the client's own loop", so the assertion
 * is on progress, not rate.
 */

const envInfo = (page: any) => page.evaluate(() => (window as any).loader.environmentInfo());

test('世界时钟:引擎自己的循环里时间真的在走,且 HUD 读数跟着变', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/?level=demo');
    await waitForWorldReady(page);
    // NOTE: no engine.stop() here — that is the entire point of this spec.

    const first = await envInfo(page);
    expect(first, 'environmentInfo is exposed to the client').not.toBeNull();
    expect(first.hour).toBeGreaterThanOrEqual(0);
    expect(first.hour).toBeLessThan(24);

    // The HUD shows what the engine reports, in HH:MM.
    const readout = page.getByTestId('compass-clock');
    await expect(readout).toHaveText(/^\d{2}:\d{2} [晴阴雨雪]\d?$/, { timeout: 15_000 });
    const firstText = await readout.textContent();

    // ── the clock moves under the client's OWN loop ──────────────────────────
    await page.waitForTimeout(10_000);
    const later = await envInfo(page);
    const minutes = (e: any) => e.hour * 60 + e.minute;
    // Wrapped past midnight during the wait? Then the later reading is smaller —
    // still progress, so compare on the circle.
    const advanced = (minutes(later) - minutes(first) + 1440) % 1440;
    expect(advanced, `clock advanced ${advanced} in-world minutes over 10 real s`).toBeGreaterThan(2);
    expect(advanced, 'and did not jump a whole day (a stuck lastTime would)').toBeLessThan(720);

    await expect(readout, 'the HUD readout followed').not.toHaveText(firstText!, { timeout: 15_000 });

    // Whether the sun COMES BACK after the darkest point is the headless twin's
    // job (day-night-cycle.test.ts walks all 24 hours and asserts exactly that).
    // Re-running it here meant stepping the whole cycle under SwiftShader: a
    // 5-minute spec that then could not close its own browser. This one owns the
    // claim only it can make — the client's own loop advances the clock.
    await page.evaluate(() => {
        (window as any).loader.engine.stop();
        // demo has an e3 video screen; a still-playing <video> keeps the browser
        // from closing gracefully once the harness stops driving frames.
        document.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    });

    await page.screenshot({ path: 'test-results/world-clock.png' });
    // eslint-disable-next-line no-console
    console.log('WORLD-CLOCK', JSON.stringify({ first, later, advanced }));
});
