import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

/**
 * Weather particles under REAL GL (engine/src/render/ParticleFX.ts).
 *
 * The unit test (engine/tests/unit/particle-weather.test.ts) pins the geometry,
 * the materials and the CPU integration — everything that is just arithmetic.
 * What only a GL context can answer is whether the material three actually
 * COMPILES for these points is the one we asked for: the per-particle alpha
 * rides a vec4 `color` attribute, which flips three onto its USE_COLOR_ALPHA
 * program path (`attribute vec4 color` + `diffuseColor *= vColor`). Get that
 * wrong and there is no exception — three logs a shader error and the volume
 * either vanishes or comes back as the opaque squares this whole rework was
 * about.
 *
 * The forcing and the stepping all happen inside ONE page.evaluate: the client's
 * EnvClock keeps ticking synthetic block heights on a setInterval, and a tick
 * landing between two evaluate calls would re-derive weatherCategory out from
 * under the assertions.
 */
test.describe('weather particles', () => {
    test('rain and snow render as animated sprites, clear hides them', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));

        await page.goto('/');
        await waitForWorldReady(page);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 30);

        const stats = await page.evaluate(() => {
            const engine = (window as any).loader.engine;
            const world = engine.getWorld();
            const scene = world.renderEngine.sceneInstance;

            let volume: any = null;
            scene.traverse((o: any) => { if (o.isPoints && o.userData?.weather) volume = o; });
            if (!volume) return { found: false } as any;

            const env = world.getComponent(
                world.queryEntities('EnvironmentStateComponent')[0], 'EnvironmentStateComponent');
            const step = (n: number) => { for (let i = 0; i < n; i++) engine.step(1 / 60); };
            const sample = () => Array.from(
                (volume.geometry.attributes.position.array as Float32Array).slice(0, 300));

            env.weatherCategory = 'rain'; env.weatherGrade = 3;
            step(10);
            const rain = {
                visible: volume.visible,
                drawn: volume.geometry.drawRange.count,
                hasMap: !!volume.material.map,
                vertexColors: volume.material.vertexColors,
                alphaItemSize: volume.geometry.attributes.color.itemSize,
                size: volume.material.size,
            };
            const before = sample();
            step(10);
            const after = sample();
            // y only: with the player standing still, rain has no lateral motion in
            // z at all (that is snow's sway), so an all-components ratio caps at 2/3
            // by design and would say nothing about whether anything FELL.
            const ys = before.map((v, i) => [v, i] as const).filter(([, i]) => i % 3 === 1);
            const movedFraction = ys.filter(([v, i]) => v !== after[i]).length / ys.length;
            // Alpha must be doing something: some particles lit, none saturated at
            // the very edge of the volume.
            const alphas = Array.from(volume.geometry.attributes.color.array as Float32Array)
                .filter((_, i) => i % 4 === 3).slice(0, rain.drawn);
            const lit = alphas.filter((a) => a > 0.2).length;

            env.weatherCategory = 'snow'; env.weatherGrade = 2;
            step(10);
            const snow = { visible: volume.visible, size: volume.material.size, hasMap: !!volume.material.map };

            env.weatherCategory = 'clear';
            step(5);
            const clearVisible = volume.visible;

            return { found: true, rain, movedFraction, lit, litOf: rain.drawn, snow, clearVisible };
        });

        expect(stats.found, 'no weather volume in the scene').toBe(true);

        // three prints 'THREE.WebGLProgram: Shader Error …' plus the raw GLSL log.
        const shaderErrors = errors.filter((t) =>
            /Shader Error|WebGLProgram|GLSL|COMPILE_STATUS|VALIDATE_STATUS/i.test(t));
        expect(shaderErrors).toEqual([]);

        // Rain: visible, sprite-mapped, on the per-particle-alpha program path.
        expect(stats.rain.visible).toBe(true);
        expect(stats.rain.hasMap).toBe(true);
        expect(stats.rain.vertexColors).toBe(true);
        expect(stats.rain.alphaItemSize, 'vec3 colours ⇒ three drops the alpha path').toBe(4);
        expect(stats.rain.drawn).toBeGreaterThan(500);

        // It is precipitation, not a static cloud of dots welded to the camera.
        expect(stats.movedFraction, 'positions frozen between frames').toBeGreaterThan(0.9);
        // …and a decent share of it is actually opaque enough to see.
        expect(stats.lit / stats.litOf).toBeGreaterThan(0.2);

        // Snow renders too (it used to fall through to hidden) with the smaller flake.
        expect(stats.snow.visible).toBe(true);
        expect(stats.snow.hasMap).toBe(true);
        expect(stats.snow.size).toBeLessThan(stats.rain.size);

        expect(stats.clearVisible).toBe(false);
    });
});
