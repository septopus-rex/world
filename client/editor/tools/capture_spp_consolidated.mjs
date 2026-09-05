import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Village with consolidation enabled (?spp_consolidate=1)...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' || text.includes('Error') || text.includes('spp') || text.includes('fail')) {
            console.log('PAGE:', msg.type(), text);
        }
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    console.log('Navigating to http://127.0.0.1:7777/?level=pal1_village_compound&spp_consolidate=1 ...');
    await page.goto('http://127.0.0.1:7777/?level=pal1_village_compound&spp_consolidate=1', { waitUntil: 'domcontentloaded' });

    console.log('Waiting for world ready...');
    await page.waitForFunction(() => {
        const l = window.loader;
        return l && l.engine && l.engine.getWorld() && typeof l.teleportSeptopus === 'function';
    }, null, { timeout: 45_000 });

    console.log('Removing loader overlay and parking avatar outside...');
    await page.evaluate(() => {
        document.getElementById('init-loader')?.remove();
        window.loader.teleportSeptopus([2048, 2048], [40.0, 40.0, -10.0]);
    });

    console.log('Waiting 20s for all environmental models and textures to compile...');
    await page.waitForTimeout(20000);

    console.log('Stopping engine render loop to lock camera...');
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
            w.renderEngine.scene?.traverse((o) => {
                if (o.type === "SkinnedMesh" || o.name?.startsWith("vanguard") || o.name === "Character") {
                    o.visible = false;
                }
            });
            const re = w.renderEngine;
            const metrics = w.metrics;
            const camPos = metrics.septopusToEngine(cam, [2048, 2048]);
            const targetPos = metrics.septopusToEngine(target, [2048, 2048]);
            re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
            re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
            re.render();
        }, { cam, target });
        await page.waitForTimeout(1000);
    }

    // View 1: Panoramic Isometric Overview
    console.log('Capturing View 1: Panoramic Overview (Consolidated)...');
    await setCamera([2.0, -8.0, 22.0], [16.0, 10.0, 3.0]);
    const isoPath = path.join(BRAIN_DIR, 'pal1_village_isometric_consolidated.png');
    await page.screenshot({ path: isoPath });
    console.log(`Saved: ${isoPath}`);

    // View 2: Path Promenade Looking East
    console.log('Capturing View 2: Path Promenade Looking East (Consolidated)...');
    await setCamera([6.0, 2.0, 1.6], [24.0, 2.0, 1.4]);
    const pathEastPath = path.join(BRAIN_DIR, 'pal1_village_path_east_consolidated.png');
    await page.screenshot({ path: pathEastPath });
    console.log(`Saved: ${pathEastPath}`);

    // View 3: Outside East Courtyard Moon Gate Entry
    console.log('Capturing View 3: East Moon Gate Approach (Consolidated)...');
    await setCamera([22.0, 0.5, 1.6], [22.0, 7.0, 1.6]);
    const eastGatePath = path.join(BRAIN_DIR, 'pal1_village_east_gate_consolidated.png');
    await page.screenshot({ path: eastGatePath });
    console.log(`Saved: ${eastGatePath}`);

    // View 4: Outside West Courtyard Moon Gate Entry (Consolidated)
    console.log('Capturing View 4: West Moon Gate Approach (Consolidated)...');
    await setCamera([8.0, 0.5, 1.6], [8.0, 7.0, 1.6]);
    const westGatePath = path.join(BRAIN_DIR, 'pal1_village_west_gate_consolidated.png');
    await page.screenshot({ path: westGatePath });
    console.log(`Saved: ${westGatePath}`);

    await browser.close();
    console.log('All consolidated screenshots captured successfully!');
}

main().catch(err => {
    console.error('Capture failed:', err);
    process.exit(1);
});
