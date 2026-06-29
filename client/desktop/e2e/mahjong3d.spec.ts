import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Native 3D mahjong (MahjongSystem) in the REAL client: the table block streams
// in, the loader deals the tiles as adjunct entities, a human discard reveals a
// tile face-up in the pool, and bots auto-play around the table — the discrete,
// turn-based counterpart to pool3d.spec.ts.

function tilesState(page: any) {
    return page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const out: any[] = [];
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
            const tc = w.getComponent(eid, 'MahjongTileComponent');
            const t = w.getComponent(eid, 'TransformComponent');
            out.push({ tileId: tc.tileId, zone: tc.zone, seat: tc.seat, faceUp: tc.faceUp, ex: t.position[0], ez: t.position[2] });
        }
        return out;
    });
}

// Top-down view of the table (set camera directly + render once — no step, so the
// follow-camera doesn't override it).
async function frameTable(page: any) {
    await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
            const t = w.getComponent(eid, 'TransformComponent');
            cx += t.position[0]; cy += t.position[1]; cz += t.position[2]; n++;
        }
        if (!n) return;
        cx /= n; cy /= n; cz /= n;
        const re = w.renderEngine;
        re.setMainCameraPosition(cx, cy + 7, cz + 0.01);
        re.setMainCameraLookAt(cx, cy, cz);
        re.render(false);
    });
}

test('3D mahjong: the table deals in the client and a discard reveals a tile', async ({ page }) => {
    test.setTimeout(180_000); // software WebGL + many box meshes is slow
    await bootDeterministic(page);
    await stepEngine(page, 12); // stream the table block → the loader auto-deals

    // The real client wiring dealt the game (53 on-table tiles, human to act).
    const dealt = await page.evaluate(() => (window as any).loader.engine.mahjongState());
    expect(dealt, 'loader auto-dealt the table on block.loaded').toBeTruthy();
    expect(dealt.turn).toBe(dealt.humanSeat);
    expect(dealt.hands[dealt.humanSeat].length).toBe(14);

    const racked = await tilesState(page);
    expect(racked.length, '14 + 13×3 = 53 on-table tiles').toBe(53);
    const human = racked.filter((t) => t.zone === 'hand' && t.seat === dealt.humanSeat);
    const opp = racked.filter((t) => t.zone === 'hand' && t.seat !== dealt.humanSeat);
    expect(human.every((t) => t.faceUp), 'your hand is open').toBe(true);
    expect(opp.every((t) => !t.faceUp), 'opponents are concealed').toBe(true);

    await frameTable(page);
    await page.screenshot({ path: 'test-results/mahjong3d-dealt.png' });

    // Re-deal deterministically with instant bots so the turn loop runs fast.
    await page.evaluate(() => (window as any).loader.engine.setupMahjong({
        block: [2047, 2048], origin: [8, 8], surfaceZ: 0.95, seed: 777, botDelay: 0,
    }));
    await stepEngine(page, 1);

    // Play three full rounds: discard the first hand tile, let the three bots play.
    for (let round = 0; round < 3; round++) {
        const st = await page.evaluate(() => (window as any).loader.engine.mahjongState());
        const fired = await page.evaluate((tid) => (window as any).loader.engine.mahjongDiscard(tid), st.hands[st.humanSeat][0]);
        expect(fired, 'human discard accepted').toBe(true);
        await stepEngine(page, 4); // bots 1→2→3 discard, turn returns to the human
    }

    const after = await page.evaluate(() => (window as any).loader.engine.mahjongState());
    expect(after.turn).toBe(after.humanSeat);                      // back to the human
    expect(after.discards.every((d: number[]) => d.length === 3)).toBe(true); // each seat discarded 3×
    const pool = (await tilesState(page)).filter((t) => t.zone === 'discard');
    expect(pool.length).toBe(12);
    expect(pool.every((t) => t.faceUp), 'every discard is face-up').toBe(true);

    await frameTable(page);
    await page.screenshot({ path: 'test-results/mahjong3d-after-rounds.png' });
    // eslint-disable-next-line no-console
    console.log('MAHJONG3D', JSON.stringify({ dealt: racked.length, discards: after.discards.map((d: number[]) => d.length) }));
});
