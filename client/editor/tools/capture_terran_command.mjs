import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture StarCraft 1 Terran Command Center scenes...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    async function loadLevel(levelName) {
        console.log(`\nNavigating to http://127.0.0.1:7777/?level=${levelName} ...`);
        await page.goto(`http://127.0.0.1:7777/?level=${levelName}`, { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => {
            const l = window.loader;
            return l && l.engine && l.engine.getWorld() && typeof l.teleportSeptopus === 'function';
        }, null, { timeout: 45_000 });

        await page.evaluate(() => {
            document.getElementById('init-loader')?.remove();
            window.loader.teleportSeptopus([2048, 2048], [35.0, 35.0, -10.0]);
        });

        console.log('Waiting for block 2048_2048 to finish all adjunct builds (pendingAdjuncts === 0)...');
        await page.waitForFunction(() => {
            const w = window.loader?.engine?.getWorld();
            if (!w) return false;
            const blockEntities = w.queryEntities("BlockComponent");
            for (const eid of blockEntities) {
                const comp = w.getComponent(eid, "BlockComponent");
                if (comp.x === 2048 && comp.y === 2048) {
                    return comp.isInitialized && comp.pendingAdjuncts === 0;
                }
            }
            return false;
        }, null, { timeout: 45_000 });

        console.log('Waiting 8s for GLB models to fully swap into scene...');
        await page.waitForTimeout(8000);

        // Stop engine loop so manual camera stays fixed and avatars/DOM are cleaned
        await page.evaluate(() => {
            window.loader.engine.stop();
            const w = window.loader.engine.getWorld();
            w.renderEngine.scene?.traverse((o) => {
                if (o.type === "SkinnedMesh" || o.name?.startsWith("vanguard") || o.name === "Character") {
                    o.visible = false;
                }
            });

            // Clean DOM overlays
            document.querySelectorAll('button, nav, [class*="action-rail"], [class*="ActionRail"], [class*="MiniCompass"]').forEach(el => {
                el.style.display = 'none';
            });
            document.querySelectorAll('div, span, p').forEach(el => {
                const txt = el.innerText || '';
                if (txt.includes('进入游戏') || txt.includes('Playable Zone') || txt.includes('AI 造物') || txt.includes('World Labs')) {
                    el.style.display = 'none';
                }
            });
        });
    }

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

    // ==========================================
    // Scene 1: terran_command_center (Assembled)
    // ==========================================
    await loadLevel('terran_command_center');

    console.log('Capturing View 1: SC1 Classic Isometric Perspective (South-East angle)...');
    // Perfectly frames: Front Ramp on Left, Addon Dock on Right, Golden Cupola Center, Twin Silos Rear!
    await setCamera([14.5, -5.5, 8.5], [8.0, 7.5, 2.8]);
    const facadePath = path.join(BRAIN_DIR, 'terran_facade_assembled.png');
    await page.screenshot({ path: facadePath });
    console.log(`Saved: ${facadePath}`);

    console.log('Capturing View 2: Interior Central Tactical Command Bridge...');
    await setCamera([9.2, 7.2, 1.4], [6.8, 8.0, 1.2]);
    const holoPath = path.join(BRAIN_DIR, 'terran_interior_holo_bridge.png');
    await page.screenshot({ path: holoPath });
    console.log(`Saved: ${holoPath}`);

    console.log('Capturing View 3: Interior Armory & C-14 Gauss Rifles...');
    await setCamera([6.0, 8.0, 1.4], [3.6, 8.0, 1.3]);
    const armoryPath = path.join(BRAIN_DIR, 'terran_interior_armory.png');
    await page.screenshot({ path: armoryPath });
    console.log(`Saved: ${armoryPath}`);

    console.log('Capturing View 4: Interior SCV Logistics & Vespene/Mineral Bay...');
    await setCamera([8.0, 8.5, 1.4], [8.0, 11.5, 1.2]);
    const logisticsPath = path.join(BRAIN_DIR, 'terran_interior_logistics.png');
    await page.screenshot({ path: logisticsPath });
    console.log(`Saved: ${logisticsPath}`);

    // ==========================================
    // Scene 2: terran_command_lifted (Lift-Off Cutaway)
    // ==========================================
    await loadLevel('terran_command_lifted');

    console.log('Capturing View 5: SC1 Classic Lift-Off Cutaway (Elevated Roof & Silos)...');
    await setCamera([14.5, -6.5, 13.0], [8.0, 7.5, 4.5]);
    const liftedPath = path.join(BRAIN_DIR, 'terran_lifted_liftoff.png');
    await page.screenshot({ path: liftedPath });
    console.log(`Saved: ${liftedPath}`);

    await browser.close();
    console.log('All 5 SC1 Terran Command Center views captured successfully!');
}

main().catch(err => {
    console.error('Capture failed:', err);
    process.exit(1);
});
