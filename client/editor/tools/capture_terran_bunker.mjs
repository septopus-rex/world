import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture StarCraft 1 Terran Bunker scenes...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        bypassCSP: true,
    });
    const page = await context.newPage();
    await page.route('**/*.glb*', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
            response,
            headers: {
                ...response.headers(),
                'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
        });
    });

    async function loadLevel(levelName) {
        const url = `http://127.0.0.1:7777/?level=${levelName}&nocache=${Date.now()}`;
        console.log(`\nNavigating to ${url} ...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => {
            const l = window.loader;
            return l && l.engine && l.engine.getWorld() && typeof l.teleportSeptopus === 'function';
        }, null, { timeout: 45_000 });

        await page.evaluate(() => {
            document.getElementById('init-loader')?.remove();
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

        console.log('Waiting for all GLB models to finish swapping (isPlaceholder === 0)...');
        await page.waitForFunction(() => {
            const w = window.loader?.engine?.getWorld();
            if (!w) return false;
            let placeholders = 0;
            w.renderEngine.scene.traverse(o => {
                if (o.userData?.isPlaceholder === true && o.userData?.adjunct === 'module') {
                    placeholders++;
                }
            });
            return placeholders === 0;
        }, null, { timeout: 60_000 });
        console.log('All GLB models fully swapped! Waiting 1s for settle...');
        await page.waitForTimeout(1000);

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

    // --- 1. Assembled Level (terran_bunker) ---
    await loadLevel('terran_bunker');

    // 1.1 South-West Isometric Exterior (Exact SC1 25° Sprite Perspective)
    console.log('Capturing bunker_exterior_iso.png ...');
    await setCamera([0.8, 0.8, 5.6], [8.0, 8.0, 1.35]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_exterior_iso.png') });

    // 1.2 South Front View (Blast Ramp & Slits & Dome)
    console.log('Capturing bunker_exterior_front.png ...');
    await setCamera([8.0, 0.8, 2.2], [8.0, 8.0, 1.35]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_exterior_front.png') });

    // --- 2. Lifted / Cutaway Level (terran_bunker_lifted) ---
    await loadLevel('terran_bunker_lifted');

    // 2.1 Cutaway Isometric Bird's Eye (showing lifted roof dome + 4 firing stations + carousel)
    console.log('Capturing bunker_lifted_cutaway.png ...');
    await setCamera([1.2, 1.2, 11.5], [8.0, 8.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_lifted_cutaway.png') });

    // 2.2 Central Automated Rotary Ammo Carousel Close-up
    console.log('Capturing bunker_ammo_tower_close.png ...');
    await setCamera([8.0, 5.8, 1.25], [8.0, 8.0, 0.85]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_ammo_tower_close.png') });

    // 2.3 Heavy Gun Station & Slit Embrasure (Over-The-Shoulder combat view)
    console.log('Capturing bunker_gun_station_close.png ...');
    await setCamera([8.0, 6.8, 1.25], [8.0, 5.5, 0.95]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_gun_station_close.png') });

    // 2.4 Periscope Fire Control Console & Glowing CRT Radar Screen
    console.log('Capturing bunker_periscope_radar_close.png ...');
    await setCamera([7.4, 8.6, 1.30], [6.6, 9.4, 1.05]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_periscope_radar_close.png') });

    // 2.5 Stimpack Emergency Locker & Escape Hatch
    console.log('Capturing bunker_stim_hatch_close.png ...');
    await setCamera([7.8, 7.8, 1.45], [9.4, 6.6, 0.95]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_stim_hatch_close.png') });

    await browser.close();
    console.log('\n[DONE] All 7 Terran Bunker screenshots saved to brain directory!');
}

main().catch((err) => {
    console.error('Capture failed:', err);
    process.exit(1);
});
