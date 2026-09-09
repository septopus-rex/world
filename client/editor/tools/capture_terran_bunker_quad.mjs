import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture StarCraft 1 Terran 4-Linked Bunker (SPP Linear4)...');
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
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

    const url = `http://127.0.0.1:7777/?level=terran_bunker_quad&nocache=${Date.now()}`;
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

    // 1. Isometric Panoramic Overview of 32m 4-Linked Fortress
    console.log('Capturing bunker_linear4_iso.png ...');
    await setCamera([6.0, -8.0, 16.0], [28.0, 12.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_linear4_iso.png') });

    // 2. Frontline Assault View (Continuous 32m Firing Line)
    console.log('Capturing bunker_linear4_front.png ...');
    await setCamera([28.0, 0.5, 3.2], [28.0, 12.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_linear4_front.png') });

    // 3. Continuous Internal Corridor Walkthrough (looking through bunker_link_arch arches)
    console.log('Capturing bunker_linear4_interior_corridor.png ...');
    await setCamera([14.5, 10.2, 1.4], [36.0, 10.2, 1.4]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_linear4_interior_corridor.png') });

    // 4. Bay 3 Cutaway Overhead View (Lifted Roof & C-14 Gun Stations)
    console.log('Capturing bunker_linear4_bay3_cutaway.png ...');
    await setCamera([28.0, 6.0, 8.5], [32.0, 12.0, 1.5]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_linear4_bay3_cutaway.png') });

    // 5. Rear Perspective (Dual Entrances & bunker_link_wall)
    console.log('Capturing bunker_linear4_rear.png ...');
    await setCamera([28.0, 24.0, 11.0], [28.0, 12.0, 2.0]);
    await page.screenshot({ path: path.join(BRAIN_DIR, 'bunker_linear4_rear.png') });

    console.log('All 5 Linear-4 Bunker perspectives captured successfully!');
    await browser.close();
}

main().catch(err => {
    console.error('Fatal error in capture script:', err);
    process.exit(1);
});
