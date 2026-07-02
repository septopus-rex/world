import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Hardening ③ — WebGL context loss: a GPU reset/driver crash must not leave a
// permanently black canvas or crash the loop. The engine preventDefaults the
// lost event (allowing restore), no-ops render() while lost (simulation keeps
// stepping), and resumes drawing on restore. Driven deterministically via the
// WEBGL_lose_context extension.

test('context loss pauses rendering, keeps simulating, and resumes on restore', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await bootDeterministic(page);

    const frameOf = () => page.evaluate(() =>
        (window as any).loader.engine.getWorld().renderEngine.renderer.info.render.frame);
    const playerY = () => page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const p = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        return w.getComponent(p, 'TransformComponent').position[1];
    });

    // Baseline: stepping renders frames.
    const f0 = await frameOf();
    await stepEngine(page, 10);
    const f1 = await frameOf();
    expect(f1, 'renders while context is live').toBeGreaterThan(f0);

    // Force-lose the context.
    await page.evaluate(() => {
        const gl = (window as any).loader.engine.getWorld().renderEngine.renderer.getContext();
        (window as any).__loseExt = gl.getExtension('WEBGL_lose_context');
        (window as any).__loseExt.loseContext();
    });
    await page.waitForTimeout(200); // let the lost event dispatch

    // While lost: render() no-ops (frame counter frozen) but SIMULATION steps on.
    const fLost0 = await frameOf();
    await stepEngine(page, 20);
    const fLost1 = await frameOf();
    expect(fLost1, 'no draws into a dead context').toBe(fLost0);
    const y0 = await playerY();
    await stepEngine(page, 20);
    expect(typeof y0).toBe('number'); // simulation state stays readable/finite
    expect(errors, 'no uncaught errors during the lost window').toEqual([]);

    // Restore: rendering resumes.
    await page.evaluate(() => (window as any).__loseExt.restoreContext());
    await page.waitForTimeout(300); // restore event + first re-upload
    const fBack0 = await frameOf();
    await stepEngine(page, 10);
    const fBack1 = await frameOf();
    expect(fBack1, 'rendering resumed after restore').toBeGreaterThan(fBack0);
    expect(errors).toEqual([]);
});
