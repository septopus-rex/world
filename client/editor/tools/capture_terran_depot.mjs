import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture StarCraft 1 Terran Supply Depot scenes...');
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

        console.log('Waiting 5s for GLB models to fully swap into scene...');
        await page.waitForTimeout(5000);

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

    // --- 1. Assembled Level (terran_supply_depot) ---
    await loadLevel('terran_supply_depot');

    // 1.1 South-East Isometric Exterior
    console.log('Capturing depot_exterior_iso.png ...');
    await setCamera([19.5, 0.5, 9.5], [10.0, 8.0, 2.5]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_exterior_iso.png') });

    // 1.2 South Front View (Airlock & Window & Dampers)
    console.log('Capturing depot_exterior_front.png ...');
    await setCamera([10.0, -1.8, 3.2], [10.0, 8.0, 2.5]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_exterior_front.png') });

    // --- 2. Lifted / Cutaway Level (terran_depot_lifted) ---
    await loadLevel('terran_depot_lifted');

    // 2.1 Cutaway Isometric Bird's Eye (showing lifted roof + 6 internal bays)
    console.log('Capturing depot_lifted_cutaway.png ...');
    await setCamera([19.8, 0.8, 14.5], [10.0, 8.0, 2.5]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_lifted_cutaway.png') });

    // 2.2 North Central Cold Fusion Reactor Core Close-up
    console.log('Capturing depot_power_core_close.png ...');
    await setCamera([10.0, 7.2, 1.8], [10.0, 10.0, 1.6]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_power_core_close.png') });

    // 2.3 Central Supply Crates & Pallet Staging Close-up
    console.log('Capturing depot_supply_crates_close.png ...');
    await setCamera([12.8, 6.0, 1.6], [10.0, 6.0, 1.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_supply_crates_close.png') });

    // 2.4 Cryogenic Ration Freezer Close-up
    console.log('Capturing depot_cryo_freezer_close.png ...');
    await setCamera([7.2, 10.0, 1.5], [4.6, 10.0, 1.3]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_cryo_freezer_close.png') });

    // 2.5 Logistics Workstation & Folding Bunks Overview
    console.log('Capturing depot_logistics_bunks_close.png ...');
    await setCamera([11.5, 7.5, 1.8], [14.8, 7.5, 1.4]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'depot_logistics_bunks_close.png') });

    await browser.close();
    console.log('\n[DONE] All 6 Terran Supply Depot screenshots saved to brain directory!');
}

main().catch((err) => {
    console.error('Capture failed:', err);
    process.exit(1);
});
