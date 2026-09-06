import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://127.0.0.1:7777/?level=pal1_rooms_lifted', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.loader?.engine?.getWorld());

console.log('Waiting for block 2048_2048 to have pendingAdjuncts === 0...');
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

console.log('All adjuncts initialized! Now waiting 8s for GLB models to fully swap in...');
await page.waitForTimeout(8000);

// Set camera
await page.evaluate(() => {
    window.loader.engine.stop();
    const w = window.loader.engine.getWorld();
    const re = w.renderEngine;
    const metrics = w.metrics;
    const camPos = metrics.septopusToEngine([-1.5, -4.5, 16.0], [2048, 2048]);
    const targetPos = metrics.septopusToEngine([8.0, 6.0, 4.5], [2048, 2048]);
    re.setMainCameraPosition(camPos[0], camPos[1], camPos[2]);
    re.setMainCameraLookAt(targetPos[0], targetPos[1], targetPos[2]);
    re.render();
});

await page.screenshot({ path: '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0/test_lifted_fixed.png' });
console.log('Saved test_lifted_fixed.png!');
await browser.close();
