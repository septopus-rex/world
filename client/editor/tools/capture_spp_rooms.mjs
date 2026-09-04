import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Rooms SPP scene...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    console.log('Navigating to http://127.0.0.1:7777/?level=pal1_rooms ...');
    await page.goto('http://127.0.0.1:7777/?level=pal1_rooms', { waitUntil: 'domcontentloaded' });

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

    console.log('Waiting 15s for GLB models to decompress and shaders to compile...');
    await page.waitForTimeout(15000);

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

    // Helper to set camera in Septopus coordinate space
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
        await page.waitForTimeout(500);
    }

    // View 1: Isometric Overview (South-West high angle)
    console.log('Capturing View 1: Isometric Overview...');
    await setCamera([0.0, -3.0, 13.0], [8.0, 6.0, 1.8]);
    const isoPath = path.join(BRAIN_DIR, 'pal1_rooms_isometric.png');
    await page.screenshot({ path: isoPath });
    console.log(`Saved: ${isoPath}`);

    // View 2: Corridor Walkway (Standing at West end looking East)
    console.log('Capturing View 2: Corridor Walkway along +X...');
    await setCamera([2.6, 4.0, 1.6], [13.0, 4.0, 1.6]);
    const corridorPath = path.join(BRAIN_DIR, 'pal1_rooms_corridor.png');
    await page.screenshot({ path: corridorPath });
    console.log(`Saved: ${corridorPath}`);

    // View 3: Corridor looking at Guestroom 2 Door & Railing
    console.log('Capturing View 3: Corridor looking North at Room 2 Door...');
    await setCamera([8.0, 2.5, 1.6], [8.0, 6.0, 1.8]);
    const doorPath = path.join(BRAIN_DIR, 'pal1_rooms_door.png');
    await page.screenshot({ path: doorPath });
    console.log(`Saved: ${doorPath}`);

    // View 4: Inside Room 2 looking North at Window
    console.log('Capturing View 4: Inside Room 2 looking at Lattice Window...');
    await setCamera([8.0, 7.2, 1.6], [8.0, 10.0, 1.8]);
    const winPath = path.join(BRAIN_DIR, 'pal1_rooms_window.png');
    await page.screenshot({ path: winPath });
    console.log(`Saved: ${winPath}`);

    // View 5: Inside Room 2 looking South towards Corridor Door
    console.log('Capturing View 5: Inside Room 2 looking South towards Door...');
    await setCamera([8.0, 8.8, 1.6], [8.0, 5.5, 1.6]);
    const insideDoorPath = path.join(BRAIN_DIR, 'pal1_rooms_inside_door.png');
    await page.screenshot({ path: insideDoorPath });
    console.log(`Saved: ${insideDoorPath}`);

    // View 6: Room 0 West Wall (inspecting Left face variant)
    console.log('Capturing View 6: Room 0 West Wall (Left face)...');
    await setCamera([4.5, 8.0, 1.6], [2.0, 8.0, 1.6]);
    const westWallPath = path.join(BRAIN_DIR, 'pal1_rooms_west_wall.png');
    await page.screenshot({ path: westWallPath });
    console.log(`Saved: ${westWallPath}`);

    // View 7: 3D Roof Close-up (Tile Ridges, Eaves, Ridge Apex, Chiwen Beast)
    console.log('Capturing View 7: Roof Close-up Detail...');
    await setCamera([0.5, 2.0, 7.8], [5.5, 5.5, 4.6]);
    const roofPath = path.join(BRAIN_DIR, 'pal1_rooms_roof_detail.png');
    await page.screenshot({ path: roofPath });
    console.log(`Saved: ${roofPath}`);

    // View 8: Outside Looking Up at Deep Overhanging Eaves & Brackets
    console.log('Capturing View 8: Overhanging Eaves from Outside...');
    await setCamera([8.0, -1.0, 2.2], [8.0, 2.5, 4.3]);
    const eavePath = path.join(BRAIN_DIR, 'pal1_rooms_eave_underside.png');
    await page.screenshot({ path: eavePath });
    console.log(`Saved: ${eavePath}`);

    await browser.close();
    console.log('All views captured successfully!');
}

main().catch((err) => {
    console.error('Capture error:', err);
    process.exit(1);
});
