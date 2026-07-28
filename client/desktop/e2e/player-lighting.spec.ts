import { test, expect } from '@playwright/test';
import { waitForWorldReady } from './helpers';

/**
 * Player-attached lights under REAL GL (render/PlayerLighting). The headless twin
 * (engine/tests/systems/player-lighting.test.ts) pins the arithmetic — off at
 * noon, up at night, following the player. What it cannot see is whether any of
 * it reaches the screen: intensities are in candela against a 1/d² falloff, so
 * "the light exists and has a non-zero intensity" and "you can actually see your
 * avatar" are entirely different claims, and only a pixel can tell them apart.
 *
 * Method: settle the world into night, then STOP stepping and drive
 * setPlayerLightAnchor / setFlashlight directly between renders. That isolates
 * each light — nothing else in the frame changes between the two samples, so a
 * brightness difference can only be the light being measured. (Stepping instead
 * would let EnvironmentSystem overwrite the night factor and the sun move.)
 */

/** Mean luma of a WxH box centred on (fx, fy) as fractions of the canvas. */
const LUMA_PROBE = `(gl, fx, fy, w, h) => {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(gl, Math.floor(gl.width * fx - w / 2), Math.floor(gl.height * fy - h / 2), w, h, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4);
}`;

test.describe('player lighting (real GL)', () => {
    test.setTimeout(300_000);

    test('夜里靠角色补光与手电筒才看得见:两者都真的照到画面上', async ({ page }) => {
        await page.goto('/');
        await waitForWorldReady(page);
        await page.evaluate(() => (window as any).loader.engine.stop());
        // The boot splash is a translucent black sheet over the whole canvas — it
        // fades on its own timer, and reading pixels through it measures the
        // sheet, not the lighting (it cost an afternoon of "the fill does
        // nothing"). Drop it outright rather than waiting on an animation.
        await page.evaluate(() => document.getElementById('init-loader')?.remove());

        const samples = await page.evaluate((probeSrc: string) => {
            const luma = eval(probeSrc) as (gl: any, fx: number, fy: number, w: number, h: number) => number;
            const loader: any = (window as any).loader;
            const w: any = loader.engine.getWorld();
            const re: any = w.renderEngine;

            // Midnight. The sun angle is CHASED (2.5/s), so this needs seconds of
            // simulation, not a frame — a single step would sample dusk.
            const env: any = w.systems.findSystemByName('EnvironmentSystem');
            env.localSeconds = 0;
            for (let i = 0; i < 300; i++) loader.engine.step(1 / 60);

            const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
            const t: any = w.getComponent(pid, 'TransformComponent');
            const [px, py, pz] = t.position;
            const gl: HTMLCanvasElement = document.querySelector('canvas[data-engine]') as any
                ?? document.querySelector('canvas') as any;

            // Probe the avatar's body, dead centre and low in the frame (the
            // third-person rig frames it there) — what the report was about:
            // "can't see anything". Render TWICE before reading: with
            // preserveDrawingBuffer off, a single out-of-rAF render leaves the
            // PREVIOUS frame's buffer readable, which silently shifts every sample
            // one step down the sequence (first symptom: turning the fill ON
            // appeared to make the frame darker).
            const shot = () => { re.render(false); re.render(false); return luma(gl, 0.5, 0.74, 60, 60); };

            re.setFlashlight(false);
            re.setPlayerLightAnchor(px, py, pz, 0);   // as if it were day: fill off
            const unlit = shot();
            re.setPlayerLightAnchor(px, py, pz, 1);   // full night: fill on
            const filled = shot();
            re.setFlashlight(true);
            const torched = shot();
            re.setFlashlight(false);
            const backToFill = shot();

            return { unlit, filled, torched, backToFill };
        }, LUMA_PROBE);

        // Before this feature, night WAS the `unlit` sample — that is the bug.
        // (Measured ~1.6/255: the avatar is not dim, it is simply not there.)
        expect(samples.unlit, 'baseline night should be near-black').toBeLessThan(10);
        // The fill has to make a difference a person would call "now I can see it",
        // not a measurable-but-invisible nudge. Tuning notes are on
        // PlayerLighting.FILL_NIGHT; this lands around 30/255.
        expect(samples.filled, `fill barely registered: ${samples.unlit} → ${samples.filled}`)
            .toBeGreaterThan(samples.unlit + 15);
        // …and not blow the avatar out into a daylit cut-out on a black field,
        // which is what the first attempt at "brighter" actually produced.
        expect(samples.filled, 'fill is far too hot').toBeLessThan(120);

        // The torch adds on top of the fill, and switching it off gives the frame
        // back exactly — it is view state, it must not leave anything behind.
        expect(samples.torched).toBeGreaterThan(samples.filled + 5);
        expect(Math.abs(samples.backToFill - samples.filled), 'torch left residue').toBeLessThan(2);
    });
});
