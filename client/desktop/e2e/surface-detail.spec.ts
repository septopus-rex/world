import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

/**
 * SurfaceDetail (engine/src/render/SurfaceDetail.ts) injects GLSL into the stock
 * MeshStandardMaterial via onBeforeCompile. The unit test pins the chunk anchors,
 * but only a real GL context can answer the question that actually matters:
 * DOES THE SHADER COMPILE? A syntax error there is silent in node — three logs
 * the driver's GLSL error to console and falls back, so the scene still "loads"
 * while every textured surface renders wrong. Hence this spec: boot the gallery
 * (bare entry — its 16×16 m textured ground is exactly the de-tiling case) and
 * assert a clean console plus a shader that genuinely reached the ground.
 */
test.describe('SurfaceDetail — injected shaders', () => {
    test('compile under real GL and reach the gallery ground', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));

        await page.goto('/');
        await waitForWorldReady(page);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 30);

        // three prints 'THREE.WebGLProgram: Shader Error …' plus the raw GLSL log.
        const shaderErrors = errors.filter((t) =>
            /Shader Error|WebGLProgram|GLSL|COMPILE_STATUS|VALIDATE_STATUS/i.test(t));
        expect(shaderErrors).toEqual([]);

        const stats = await page.evaluate(() => {
            const scene = (window as any).loader.engine.getWorld().renderEngine.sceneInstance;
            let injected = 0, detiled = 0;
            scene.traverse((o: any) => {
                const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
                for (const m of mats) {
                    if (typeof m.customProgramCacheKey === 'function'
                        && String(m.customProgramCacheKey()).startsWith('sd:')) injected++;
                    if (m.defines && m.defines.SD_DETILE !== undefined) detiled++;
                }
            });
            return { injected, detiled };
        });

        // Macro variation rides every textured surface…
        expect(stats.injected).toBeGreaterThan(0);
        // …and the corridor's big flat ground slabs additionally de-tile.
        expect(stats.detiled).toBeGreaterThan(0);
    });
});
