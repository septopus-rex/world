import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Village Multi-Courtyard & Environment scene...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    console.log('Navigating to http://127.0.0.1:7777/?level=pal1_village_compound ...');
    await page.goto('http://127.0.0.1:7777/?level=pal1_village_compound', { waitUntil: 'domcontentloaded' });

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

    console.log('Waiting 15s for all environmental models and textures to compile...');
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

    // View 1: Panoramic Isometric Overview (东院、西院与外部环境小路全景)
    console.log('Capturing View 1: Panoramic Overview...');
    await setCamera([2.0, -8.0, 22.0], [16.0, 10.0, 3.0]);
    const isoPath = path.join(BRAIN_DIR, 'pal1_village_isometric.png');
    await page.screenshot({ path: isoPath });
    console.log(`Saved: ${isoPath}`);

    // View 2: Path Promenade Looking East (外部主步道东望：垂柳、石灯笼、竹篱笆与石桥)
    console.log('Capturing View 2: Path Promenade Looking East...');
    await setCamera([6.0, 2.0, 1.6], [24.0, 2.0, 1.4]);
    const pathEastPath = path.join(BRAIN_DIR, 'pal1_village_path_east.png');
    await page.screenshot({ path: pathEastPath });
    console.log(`Saved: ${pathEastPath}`);

    // View 3: Outside East Courtyard Moon Gate Entry (东院丁字路口向北进院通道)
    console.log('Capturing View 3: East Moon Gate Approach...');
    await setCamera([22.0, 0.5, 1.6], [22.0, 7.0, 1.6]);
    const eastGatePath = path.join(BRAIN_DIR, 'pal1_village_east_gate.png');
    await page.screenshot({ path: eastGatePath });
    console.log(`Saved: ${eastGatePath}`);

    // View 4: Outside West Courtyard Moon Gate Entry (西院丁字路口向北进院通道)
    console.log('Capturing View 4: West Moon Gate Approach...');
    await setCamera([8.0, 0.5, 1.6], [8.0, 7.0, 1.6]);
    const westGatePath = path.join(BRAIN_DIR, 'pal1_village_west_gate.png');
    await page.screenshot({ path: westGatePath });
    console.log(`Saved: ${westGatePath}`);

    // View 5: Looking West along Promenade from Bridge (从东侧石桥向西回望整条林荫石径)
    console.log('Capturing View 5: Looking West from Bridge...');
    await setCamera([28.0, 2.0, 1.8], [12.0, 2.0, 1.5]);
    const westLookPath = path.join(BRAIN_DIR, 'pal1_village_west_look.png');
    await page.screenshot({ path: westLookPath });
    console.log(`Saved: ${westLookPath}`);

    // View 6: Detail of Stone Lantern & Bamboo Grove (石经幢灯、修竹林与垂柳特写)
    console.log('Capturing View 6: Environmental Close-up...');
    await setCamera([19.5, 0.8, 1.4], [21.5, 1.8, 1.2]);
    const detailPath = path.join(BRAIN_DIR, 'pal1_village_detail.png');
    await page.screenshot({ path: detailPath });
    console.log(`Saved: ${detailPath}`);

    await browser.close();
    console.log('All village views captured successfully!');
}

main().catch((err) => {
    console.error('Capture failed:', err);
    process.exit(1);
});
