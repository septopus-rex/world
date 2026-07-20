import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine, playerPosition, walkUntil } from './helpers';

// 宫殿关卡 (docs/plan/specs/palace-stress-level.md) — the 6×6 contiguous palace
// through the REAL client streaming loop (WorldContent.handleGridRequest):
// walk in through the gate, teleport-circle the corridor ring, and assert the
// resident window stays hard-bounded at 5×5=25 while every wing streams in and
// evicted wings re-materialize on return. Correctness only — SwiftShader is not
// a performance environment (renderer.info baselines are a manual real-browser
// pass, spec §6/§8).

const ringBlocks: Array<[number, number]> = [
    [2102, 1101], [2103, 1101], [2104, 1101],
    [2104, 1102], [2104, 1103], [2104, 1104],
    [2103, 1104], [2102, 1104], [2101, 1104],
    [2101, 1103], [2101, 1102], [2101, 1101],
];

const adjunctCountAt = (page: any, bx: number, by: number) =>
    page.evaluate(([x, y]: number[]) => {
        const w = (window as any).loader.engine.getWorld();
        return w.getEntitiesWith(['AdjunctComponent']).filter((e: number) =>
            String(w.getComponent(e, 'AdjunctComponent')?.adjunctId ?? '').startsWith(`adj_${x}_${y}_`)).length;
    }, [bx, by]);

test('宫殿: 大门步入 → 环廊巡回流式(常驻≤25) → 驱逐重返重建 → 截图', async ({ page }) => {
    // 600s, not the usual 300s: 36 blocks × 392 adjuncts under SwiftShader is the
    // heaviest spec in the suite (~3.5 min alone), and inside the full serial run
    // it crossed the 5-minute budget mid-ring — a wall-clock loss, not a logic
    // failure. Give the slowest spec room rather than trimming its coverage.
    test.setTimeout(600_000);

    await page.goto('/?level=palace');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90); // settle physics, materialize the initial window

    // Spawned inside the gate hall [2102,1100] — palace content is live around us.
    expect(await adjunctCountAt(page, 2102, 1100), 'gate-hall content materialized').toBeGreaterThan(5);
    await page.screenshot({ path: 'test-results/palace-gate.png' });

    // Walk NORTH through the gate axis wide door into the south corridor arm —
    // proves the seam-owned doorways are actually passable on foot.
    const intoCorridor = await walkUntil(page, [0, 1], async () => {
        const [, , z] = await playerPosition(page);
        return -z - (1101 - 1) * 16 >= 3; // ≥3m into corridor block [2102,1101]
    }, 900);
    expect(intoCorridor, 'walked through the gate door into the corridor').toBe(true);
    const [, alt] = await playerPosition(page);
    expect(alt, 'standing at a sane altitude (no fall-through / embed)').toBeGreaterThan(0.2);
    expect(alt).toBeLessThan(2.5);

    // Teleport-circle the corridor ring: after each hop the CLIENT streamer
    // (5×5 window, evict-outside-immediately) must hold the bound.
    for (const [bx, by] of ringBlocks) {
        await page.evaluate(([b]: any[]) => (window as any).loader.teleportSeptopus(b, [8, 8, 1.2]), [[bx, by]]);
        await stepEngine(page, 24); // GridSystem polls at 10 Hz → block.need → window sync
        await page.waitForFunction(([x, y]: number[]) => {
            const l = (window as any).loader;
            return l.getLoadedBlockCount() <= 25 && l.getLoadedBlockCount() > 0;
        }, [bx, by], { polling: 100, timeout: 30_000 });
        const count = await page.evaluate(() => (window as any).loader.getLoadedBlockCount());
        expect(count, `resident window at [${bx},${by}]`).toBeLessThanOrEqual(25);
    }

    // West arm: the NW terran guest house (b6) expanded into derived adjuncts
    // through the real client boot (stylepack registration included).
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2101, 1104], [8, 8, 1.2]));
    await stepEngine(page, 24);
    const derived = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        return w.getEntitiesWith(['AdjunctComponent']).filter((e: number) => {
            const a = w.getComponent(e, 'AdjunctComponent');
            return a?.stdData?.derivedFrom && String(a.adjunctId).startsWith('adj_2100_1105_');
        }).length;
    });
    expect(derived, 'NW terran house expanded (b6 → derived rows)').toBeGreaterThan(10);

    // The far side (gate hall) fell out of the window during the north/west leg —
    // now RETURN: the evicted wing must re-materialize from the same data.
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2102, 1100], [8, 5, 1.2]));
    await stepEngine(page, 24);
    await page.waitForFunction(() => {
        const w = (window as any).loader.engine.getWorld();
        return w.getEntitiesWith(['AdjunctComponent']).filter((e: number) =>
            String(w.getComponent(e, 'AdjunctComponent')?.adjunctId ?? '').startsWith('adj_2102_1100_')).length > 5;
    }, undefined, { polling: 100, timeout: 30_000 });
    expect(await page.evaluate(() => (window as any).loader.getLoadedBlockCount())).toBeLessThanOrEqual(25);

    // Courtyard finale: seam-straddling pond + pagoda in frame.
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2102, 1102], [8, 8, 1.2]));
    await stepEngine(page, 40);
    await page.screenshot({ path: 'test-results/palace-court.png' });
});
