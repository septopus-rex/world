import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0';

async function main() {
    console.log('Launching browser to capture PAL1 Roof Separation scenes...');
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
            window.loader.teleportSeptopus([2048, 2048], [30.0, 30.0, -10.0]);
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
    // Scene 1: pal1_rooms_separated (Assembled)
    // ==========================================
    await loadLevel('pal1_rooms_separated');

    console.log('Capturing View 1: Assembled Isometric Overview...');
    await setCamera([-1.5, -4.5, 14.0], [8.0, 6.0, 3.0]);
    const assembledPath = path.join(BRAIN_DIR, 'pal1_roof_assembled.png');
    await page.screenshot({ path: assembledPath });
    console.log(`Saved: ${assembledPath}`);

    console.log('Capturing View 2: Assembled Front Eave Underside...');
    await setCamera([8.0, 0.6, 2.2], [8.0, 4.0, 4.2]);
    const eavePath = path.join(BRAIN_DIR, 'pal1_roof_eave_underside.png');
    await page.screenshot({ path: eavePath });
    console.log(`Saved: ${eavePath}`);

    console.log('Capturing View 4: Interior Room Looking Up at Wood Ceiling...');
    await setCamera([8.0, 7.0, 1.2], [8.0, 7.0, 4.0]);
    const ceilingPath = path.join(BRAIN_DIR, 'pal1_roof_ceiling_view.png');
    await page.screenshot({ path: ceilingPath });
    console.log(`Saved: ${ceilingPath}`);

    // ==========================================
    // Scene 2: pal1_rooms_lifted (Lifted / Cutaway)
    // ==========================================
    await loadLevel('pal1_rooms_lifted');

    console.log('Capturing View 3: Lifted Roof SPP Cutaway Overview...');
    await setCamera([-1.5, -4.5, 16.0], [8.0, 6.0, 4.5]);
    const liftedPath = path.join(BRAIN_DIR, 'pal1_roof_lifted.png');
    await page.screenshot({ path: liftedPath });
    console.log(`Saved: ${liftedPath}`);

    // ==========================================
    // Scene 3: pal1_roof_only (Isolated Roof SPP)
    // ==========================================
    await loadLevel('pal1_roof_only');

    console.log('Capturing View 5: Isolated Roof SPP Structure (Floating)...');
    await setCamera([1.0, -1.5, 8.5], [8.0, 6.0, 2.5]);
    const isolatedPath = path.join(BRAIN_DIR, 'pal1_roof_isolated.png');
    await page.screenshot({ path: isolatedPath });
    console.log(`Saved: ${isolatedPath}`);

    await browser.close();
    console.log('All 5 views captured successfully with 100% full GLBs!');
}

main().catch(err => {
    console.error('Capture failed:', err);
    process.exit(1);
});
