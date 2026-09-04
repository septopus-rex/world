import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Yuhang Inn...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    console.log('Navigating to http://127.0.0.1:7777/?level=pal1_inn ...');
    await page.goto('http://127.0.0.1:7777/?level=pal1_inn', { waitUntil: 'domcontentloaded' });

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

    console.log('Waiting 20s for GLB models to decompress and shaders to compile...');
    await page.waitForTimeout(20000);

    // Stop engine update loop so we have full deterministic control of camera
    await page.evaluate(() => {
        window.loader.engine.stop();
        const w = window.loader.engine.getWorld();
        w.renderEngine.scene?.traverse((o) => {
            if (o.type === "SkinnedMesh" || o.name?.startsWith("vanguard") || o.name === "Character") {
                o.visible = false;
            }
        });
    });

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // Capture 1: Classic Isometric Overhead View (Matching PAL1 1995 map)
    // -------------------------------------------------------------
    console.log('Capturing View 1: Classic Isometric Overhead View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        const targetPos = metrics.septopusToEngine([8.0, 8.0, 2.5], [2048, 2048]);
        const camPos = metrics.septopusToEngine([-1.5, -1.5, 14.5], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const isoPath = path.join(BRAIN_DIR, 'pal1_inn_isometric.png');
    await page.screenshot({ path: isoPath });
    console.log(`Saved isometric view to: ${isoPath}`);

    // -------------------------------------------------------------
    // Capture 2: Ground-Level Interior Walkthrough View (Looking into tavern)
    // -------------------------------------------------------------
    console.log('Capturing View 2: Ground-Level Interior Walkthrough View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        const camPos = metrics.septopusToEngine([7.5, 3.2, 1.45], [2048, 2048]);
        const targetPos = metrics.septopusToEngine([7.5, 9.5, 2.2], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const intPath = path.join(BRAIN_DIR, 'pal1_inn_interior.png');
    await page.screenshot({ path: intPath });
    console.log(`Saved interior view to: ${intPath}`);

    // -------------------------------------------------------------
    // Capture 3: Counter & Staircase Detail View
    // -------------------------------------------------------------
    console.log('Capturing View 3: Counter & Staircase Detail View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        const camPos = metrics.septopusToEngine([7.2, 4.2, 1.35], [2048, 2048]);
        const targetPos = metrics.septopusToEngine([3.8, 5.2, 1.05], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const counterPath = path.join(BRAIN_DIR, 'pal1_inn_counter_detail.png');
    await page.screenshot({ path: counterPath });
    console.log(`Saved counter detail view to: ${counterPath}`);

    // -------------------------------------------------------------
    // Capture 4: 2nd-Floor Gallery & 3D Railing Detail View
    // -------------------------------------------------------------
    console.log('Capturing View 4: 2nd-Floor Gallery & 3D Railing Detail View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        // Stand on the 2nd-floor East walkway looking along the gallery railing towards North
        const camPos = metrics.septopusToEngine([12.6, 3.8, 3.9], [2048, 2048]);
        const targetPos = metrics.septopusToEngine([11.6, 8.5, 3.4], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const railingPath = path.join(BRAIN_DIR, 'pal1_inn_railing_detail.png');
    await page.screenshot({ path: railingPath });
    console.log(`Saved railing detail view to: ${railingPath}`);

    // -------------------------------------------------------------
    // Capture 5: 3D Chinese Lattice Window & Door Panel Detail View
    // -------------------------------------------------------------
    console.log('Capturing View 5: 3D Chinese Lattice Window & Door Panel Detail View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        // Direct close-up facing the 3D lattice partition window at [2.1, 9.8]
        const camPos = metrics.septopusToEngine([4.2, 9.8, 1.4], [2048, 2048]);
        const targetPos = metrics.septopusToEngine([2.1, 9.8, 1.4], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const windowPath = path.join(BRAIN_DIR, 'pal1_inn_window_detail.png');
    await page.screenshot({ path: windowPath });
    console.log(`Saved window detail view to: ${windowPath}`);

    // -------------------------------------------------------------
    // Capture 6: Ground Slate Flagstones & Dining Table Detail View
    // -------------------------------------------------------------
    console.log('Capturing View 6: Ground Slate Flagstones & Dining Table Detail View...');
    await page.evaluate(() => {
        const w = window.loader.engine.getWorld();
        const re = w.renderEngine;
        const metrics = w.metrics;
        // High angle close-up looking at dining table and surrounding slate flagstones
        const camPos = metrics.septopusToEngine([9.5, 6.5, 3.2], [2048, 2048]);
        const targetPos = metrics.septopusToEngine([7.5, 8.5, 0.4], [2048, 2048]);
        
        re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
        re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
        re.render();
    });
    await page.waitForTimeout(1000);
    const groundPath = path.join(BRAIN_DIR, 'pal1_inn_ground_detail.png');
    await page.screenshot({ path: groundPath });
    console.log(`Saved ground detail view to: ${groundPath}`);

    await browser.close();
    console.log('All tavern captures complete!');
}

main().catch(console.error);

