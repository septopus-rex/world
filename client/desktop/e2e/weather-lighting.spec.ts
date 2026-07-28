import { test, expect } from '@playwright/test';
import { waitForWorldReady } from './helpers';

/**
 * Weather → light, under REAL GL. The headless twin
 * (engine/tests/systems/weather-lighting.test.ts) pins the arithmetic: sun down,
 * fill up, fog in, fog-far pinned. What it cannot see is the half of this that
 * lives entirely inside three:
 *
 * THE FROZEN SKY. An EQUIRECT texture used as `scene.background` is converted to
 * a cube render target ONCE and cached in WebGLEnvironments' WeakMap, keyed by
 * the texture, with NO version check — only the texture's `dispose` event
 * invalidates it. So `paint()` + `needsUpdate` updates the 2D upload and nothing
 * visible. From 2026-07-25 until 2026-07-28 that meant the day cycle drove the
 * lights, the fog colour and the IBL while the VISIBLE SKY was a still image;
 * `skyInfo().horizon` reported a grey storm sky that the screen never showed.
 * Nothing in node can catch that — the bug is in the GPU-side cache.
 *
 * Runs on `?fx=full` deliberately: the cheap tier the rest of the suite uses
 * swaps the gradient for a flat Color, which is exactly the path where this bug
 * cannot occur.
 */

/** Saturation of an [r,g,b] triple — the sky going grey is a saturation collapse. */
const sat = ([r, g, b]: number[]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
};

async function sample(page: any, category: string, grade: number) {
    return page.evaluate(([cat, g]: [string, number]) => {
        const loader: any = (window as any).loader;
        const w: any = loader.engine.getWorld();
        const re: any = w.renderEngine;
        const env = w.getComponent(w.queryEntities('EnvironmentStateComponent')[0], 'EnvironmentStateComponent');
        env.weatherCategory = cat;
        env.weatherGrade = g;
        // The overcast term is CHASED (a block tick is a step change) — settle it.
        // 120 frames at chase 2.5/s leaves <1 % of the gap; more only buys
        // SwiftShader time on the full tier.
        for (let i = 0; i < 120; i++) loader.engine.step(1 / 60);

        // Pitch up so the frame is sky, render once, and read the pixel back in
        // the SAME task — with preserveDrawingBuffer off, the drawing buffer is
        // only readable before the frame is composited.
        const cam = re.mainCameraInstance;
        cam.rotation.x = 1.0;
        cam.updateMatrixWorld(true);
        re.render(false);
        const gl: HTMLCanvasElement = document.querySelector('canvas[data-engine]') as any
            ?? document.querySelector('canvas') as any;
        const off = document.createElement('canvas');
        off.width = 1; off.height = 1;
        const ctx = off.getContext('2d')!;
        ctx.drawImage(gl, Math.floor(gl.width / 2), Math.floor(gl.height * 0.12), 1, 1, 0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;

        const scene = re.sceneInstance;
        let sun = 0, amb = 0;
        scene.traverse((o: any) => {
            if (o.isDirectionalLight && !sun) sun = o.intensity;
            if (o.isAmbientLight && !amb) amb = o.intensity;
        });
        const info = re.skyInfo();
        return {
            skyPixel: [d[0], d[1], d[2]],
            horizon: info.horizon, epoch: info.epoch, iblIntensity: info.iblIntensity,
            sun, amb,
            fog: { near: scene.fog.near, far: scene.fog.far },
        };
    }, [category, grade]);
}

test.describe('weather → light (real GL)', () => {
    // 300 s, not the suite's 90 s: this is the only spec on the FULL tier, where
    // SwiftShader pays for shadows + a PMREM re-bake per phase change (~17 s per
    // 90 frames, measured in render-tier.spec.ts). Two settles plus boot does not
    // fit the default budget.
    test.setTimeout(300_000);

    test('a storm greys the SKY ITSELF, not just the lights', async ({ page }) => {
        await page.goto('/?fx=full');   // the gradient-sky tier — see the header note
        await waitForWorldReady(page);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await page.evaluate(() => { for (let i = 0; i < 60; i++) (window as any).loader.engine.step(1 / 60); });

        const clear = await sample(page, 'clear', 0);
        const storm = await sample(page, 'rain', 3);

        // ── the regression that only GL can see ──────────────────────────────
        // The sky texture must actually reach the screen. A frozen background
        // keeps this pixel bit-identical while every number below still moves.
        expect(storm.epoch, 'sky never re-published').toBeGreaterThan(clear.epoch);
        expect(storm.skyPixel, 'the rendered sky did not change at all').not.toEqual(clear.skyPixel);
        expect(sat(storm.skyPixel), `sky still blue: ${storm.skyPixel}`).toBeLessThan(sat(clear.skyPixel) * 0.5);

        // ── and the coupling itself ─────────────────────────────────────────
        expect(storm.sun).toBeLessThan(clear.sun * 0.25);          // direct beam dies
        expect(storm.amb).toBeGreaterThan(clear.amb);              // fill takes over
        expect(storm.iblIntensity).toBeGreaterThan(clear.iblIntensity);
        expect(storm.fog.near).toBeLessThan(clear.fog.near);       // visibility drops
        expect(storm.fog.far, 'weather must never move the streaming-window fog far').toBe(clear.fog.far);

        // Clear weather is an exact identity on the tuned baseline (画面基线).
        expect(clear.sun).toBeCloseTo(1.9, 1);
        expect(clear.iblIntensity).toBeCloseTo(0.32, 2);
    });
});
