import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// The unified `?level=world`: spawn at the hub [2026,705], walk through the WEST
// portal → teleport to the demo showcase [2048,2048], return through its portal,
// then walk through the EAST portal → teleport into the relocated xianjian mini-
// RPG village [2030,705]. Drives the REAL client: b8 walk-in triggers fire
// player.teleport at an anchor name, resolved across unloaded blocks via
// dataSource.view (specs/teleport-portal.md). Proves hub + demo + xianjian live
// in one data source and the portals connect them.

const loc = (page: any) => page.evaluate(() => (window as any).loader.engine.getPlayerSeptopusLocation());

/** Hold a walk intent until a teleport.done for `anchor` is observed (or budget
 *  out), then settle the arrival. Returns whether the teleport fired. */
const walkThroughPortal = async (page: any, intent: [number, number], anchor: string, maxFrames = 900) => {
    await page.evaluate(() => { (window as any).__tp = []; });
    await page.evaluate((i: number[]) => (window as any).loader.setPlayerMoveIntent(i[0], i[1]), intent);
    let got = false;
    for (let f = 0; f < maxFrames && !got; f += 15) {
        await stepEngine(page, 15);
        const tp = await page.evaluate(() => (window as any).__tp);
        got = Array.isArray(tp) && tp.includes(anchor);
    }
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 45); // settle: stream the destination block + land
    return got;
};

test('世界中枢:出生 → 西门去演示场景 → 返回 → 东门去灵草记《仙剑》', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/?level=world');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    // Capture teleport outcomes off the engine bus.
    await page.evaluate(() => {
        (window as any).__tp = [];
        (window as any).loader.engine.on('teleport.done', (p: any) => (window as any).__tp.push(p?.anchor));
        (window as any).loader.engine.on('teleport.denied', (p: any) => (window as any).__tp.push('DENIED:' + p?.reason));
    });

    // ── spawn at the hub ─────────────────────────────────────────────────────
    expect((await loc(page)).block, 'spawned at the hub block').toEqual([2026, 705]);

    // Both outbound portals + the hub return anchor exist as b8 entities.
    const hubB8 = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        let portals = 0, anchors = 0;
        for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
            const s = w.getComponent(e, 'AdjunctComponent')?.stdData;
            if (s?.typeId !== 0x00b8) continue;
            if (s.anchor?.name) anchors++;
            const acts = s.events?.flatMap((ev: any) => ev.actions ?? []) ?? [];
            if (acts.some((a: any) => a?.method === 'teleport')) portals++;
        }
        return { portals, anchors };
    });
    expect(hubB8.portals, 'two outbound portals in the hub').toBeGreaterThanOrEqual(2);
    expect(hubB8.anchors, 'a return anchor in the hub').toBeGreaterThanOrEqual(1);

    // ── WEST portal → demo showcase ──────────────────────────────────────────
    expect(await walkThroughPortal(page, [-1, 0], 'showcase'), 'walked into the showcase portal').toBe(true);
    expect((await loc(page)).block, 'arrived in the demo showcase').toEqual([2048, 2048]);
    // It's really the showcase: the 八爪残卷 book (e4) is here.
    const bookHere = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
            const s = w.getComponent(e, 'AdjunctComponent')?.stdData;
            if (s?.typeId === 0x00e4 && String(s.title ?? '').includes('八爪')) return true;
        }
        return false;
    });
    expect(bookHere, 'the demo showcase content materialized').toBe(true);

    // ── return portal → hub ──────────────────────────────────────────────────
    expect(await walkThroughPortal(page, [1, 0], 'hub'), 'walked into the return portal').toBe(true);
    expect((await loc(page)).block, 'back at the hub').toEqual([2026, 705]);

    // ── EAST portal → xianjian village ───────────────────────────────────────
    expect(await walkThroughPortal(page, [1, 0], 'xianjian'), 'walked into the xianjian portal').toBe(true);
    expect((await loc(page)).block, 'arrived in the xianjian village').toEqual([2030, 705]);
    // It's really the RPG: the quest-giver NPC (ba, aunt colour) is present.
    const auntHere = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
            const s = w.getComponent(e, 'AdjunctComponent')?.stdData;
            if (s?.typeId === 0xba && s?.visual?.color === 4482252) return true;
        }
        return false;
    });
    expect(auntHere, 'the xianjian quest-giver NPC is here').toBe(true);

    await page.screenshot({ path: 'e2e/__screenshots__/world-hub-xianjian.png' });

    // eslint-disable-next-line no-console
    console.log('WORLD-HUB', JSON.stringify(await page.evaluate(() => (window as any).__tp)));
});
