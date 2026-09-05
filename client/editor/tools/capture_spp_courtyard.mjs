import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Courtyard Multi-SPP scene...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    console.log('Navigating to http://127.0.0.1:7777/?level=pal1_courtyard ...');
    await page.goto('http://127.0.0.1:7777/?level=pal1_courtyard', { waitUntil: 'domcontentloaded' });

    console.log('Waiting for world ready...');
    await page.waitForFunction(() => {
        const l = window.loader;
        return l && l.engine && l.engine.getWorld() && typeof l.teleportSeptopus === 'function';
    }, null, { timeout: 45_000 });

    console.log('Removing loader overlay and parking avatar outside...');
    await page.evaluate(() => {
        document.getElementById('init-loader')?.remove();
        window.loader.teleportSeptopus([2048, 2048], [30.0, 30.0, -10.0]);
    });

    console.log('Waiting 15s for all multi-SPP models and textures to compile...');
    await page.waitForTimeout(15000);

    await page.evaluate(() => {
        window.loader.engine.stop();
        const w = window.loader.engine.getWorld();
        w.renderEngine.scene?.traverse((o) => {
            if (o.type === "SkinnedMesh" || o.name?.startsWith("vanguard") || o.name === "Character") {
                o.visible = false;
            }
        });
    });

    async function setCamera(cam, target) {
        await page.evaluate(({ cam, target }) => {
            const w = window.loader.engine.getWorld();
            const re = w.renderEngine;
            const metrics = w.metrics;
            const camPos = metrics.septopusToEngine(cam, [2048, 2048]);
            const targetPos = metrics.septopusToEngine(target, [2048, 2048]);
            re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
            re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
            re.render();
        }, { cam, target });
        await page.waitForTimeout(600);
    }

    // View 1: Courtyard Bird's Eye Isometric Overview
    console.log('Capturing View 1: Courtyard Overview...');
    await setCamera([-1.0, -2.5, 14.5], [8.0, 9.0, 2.5]);
    const isoPath = path.join(BRAIN_DIR, 'pal1_courtyard_isometric.png');
    await page.screenshot({ path: isoPath });
    console.log(`Saved: ${isoPath}`);

    // View 2: Moon Gate Entrance looking in (Through circular gate into garden)
    console.log('Capturing View 2: Moon Gate Entrance...');
    await setCamera([8.0, 0.0, 1.8], [8.0, 7.0, 1.7]);
    const gatePath = path.join(BRAIN_DIR, 'pal1_courtyard_moongate.png');
    await page.screenshot({ path: gatePath });
    console.log(`Saved: ${gatePath}`);

    // View 3: Central Courtyard Stone Table & Tea Set
    console.log('Capturing View 3: Stone Table & Tea Set...');
    await setCamera([6.2, 5.0, 2.2], [8.0, 6.8, 0.9]);
    const tablePath = path.join(BRAIN_DIR, 'pal1_courtyard_table.png');
    await page.screenshot({ path: tablePath });
    console.log(`Saved: ${tablePath}`);

    // View 4: Ancient Well & Taihu Rockery Garden
    console.log('Capturing View 4: Ancient Well & Rockery...');
    await setCamera([13.5, 4.2, 2.4], [11.8, 7.2, 1.2]);
    const wellPath = path.join(BRAIN_DIR, 'pal1_courtyard_well.png');
    await page.screenshot({ path: wellPath });
    console.log(`Saved: ${wellPath}`);

    // View 5: Looking up from Courtyard at Upper Wing Roof & Veranda
    console.log('Capturing View 5: Looking Up at Upper Wing...');
    await setCamera([8.0, 6.0, 1.6], [8.0, 12.5, 4.2]);
    const roofUpPath = path.join(BRAIN_DIR, 'pal1_courtyard_roof_up.png');
    await page.screenshot({ path: roofUpPath });
    console.log(`Saved: ${roofUpPath}`);

    // View 6: Looking down from Veranda into Garden (Boundary interface test)
    console.log('Capturing View 6: Veranda Looking down into Garden...');
    await setCamera([8.0, 11.8, 1.7], [8.0, 6.0, 0.6]);
    const verandaPath = path.join(BRAIN_DIR, 'pal1_courtyard_veranda_view.png');
    await page.screenshot({ path: verandaPath });
    console.log(`Saved: ${verandaPath}`);

    await browser.close();
    console.log('All courtyard views captured successfully!');
}

main().catch((err) => {
    console.error('Capture error:', err);
    process.exit(1);
});
