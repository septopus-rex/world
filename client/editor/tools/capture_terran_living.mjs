import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture StarCraft 1 Terran Living Unit scenes...');
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

    // --- 1. Assembled Level (terran_living_unit) ---
    await loadLevel('terran_living_unit');

    // 1.1 South-East Isometric Exterior
    console.log('Capturing living_exterior_iso.png ...');
    await setCamera([14.5, 1.0, 7.5], [8.0, 8.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_exterior_iso.png') });

    // 1.2 South Front View (Airlock & Window)
    console.log('Capturing living_exterior_front.png ...');
    await setCamera([8.0, -1.5, 2.8], [8.0, 8.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_exterior_front.png') });

    // --- 2. Lifted / Cutaway Level (terran_living_lifted) ---
    await loadLevel('terran_living_lifted');

    // 2.1 Cutaway Isometric Bird's Eye (showing lifted roof + living floor)
    console.log('Capturing living_lifted_cutaway.png ...');
    await setCamera([15.0, 1.5, 11.5], [8.0, 8.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_lifted_cutaway.png') });

    // 2.2 NW Sleeping Quarters Close-up (diagonal overview from open corridor)
    console.log('Capturing living_bunks_close.png ...');
    await setCamera([7.5, 7.5, 2.1], [4.75, 9.5, 1.4]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_bunks_close.png') });

    // 2.3 SE Dining / Ration Bar Close-up (diagonal overview from open corridor)
    console.log('Capturing living_dining_close.png ...');
    await setCamera([8.5, 7.5, 2.1], [11.2, 6.0, 1.3]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_dining_close.png') });

    // 2.4 NE Tactical CRT Workstation & Life Support Close-up
    console.log('Capturing living_workstation_close.png ...');
    await setCamera([8.6, 8.8, 1.8], [10.5, 11.0, 1.2]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_workstation_close.png') });

    // 2.5 SW Entrance Airlock Looking In
    console.log('Capturing living_airlock_entry.png ...');
    await setCamera([6.0, 1.8, 1.6], [6.0, 6.5, 1.5]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'living_airlock_entry.png') });

    await browser.close();
    console.log('\n[DONE] All 6 Terran Living Unit screenshots saved to brain directory!');
}

main().catch((err) => {
    console.error('Capture failed:', err);
    process.exit(1);
});
