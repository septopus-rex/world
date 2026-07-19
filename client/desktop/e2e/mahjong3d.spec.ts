import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas, enterGameAt } from './helpers';

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

// Stream the table block and wait for the loader's async setup to finish
// (generate 34 face images + ingest into the CAS, then deal). Polls rather than
// assuming a fixed step count, since face generation is asynchronous.
async function waitForDeal(page: any) {
    // Zone-gated: walk onto the native mahjong block (west of spawn) + enter Game →
    // the MahjongSystem deals. The client gates the deal on async face generation
    // (34 canvas→PNG→CAS), which under software-WebGL can lag the immediate
    // teleport — so poll generously for a COMPLETE deal (human drawn to 14), giving
    // the event loop time between steps for the faces to finish. (A real player
    // walks over seconds after boot, long after faces are ready.)
    await enterGameAt(page, [2047, 2048], [8, 8, 2]);
    for (let i = 0; i < 200; i++) {
        await stepEngine(page, 2);
        const st = await page.evaluate(() => (window as any).loader.engine.mahjongState());
        if (st && st.phase === 'playing' && st.hands?.[st.humanSeat]?.length === 14) return st;
    }
    throw new Error('mahjong table never fully dealt');
}

test('3D mahjong: the table deals in the client and a discard reveals a tile', async ({ page }) => {
    test.setTimeout(180_000); // software WebGL + many box meshes is slow
    await bootDeterministic(page);

    // The real client wiring dealt the game (53 on-table tiles, human to act).
    const dealt = await waitForDeal(page);
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

test('3D mahjong: a REAL mouse click on a hand tile discards it (truly playable)', async ({ page }) => {
    // The heaviest e2e: async 34-face CAS generation poll + FPV camera tilt +
    // raycast verification + a REAL DOM click. ~2.9m even uncontended under
    // software-WebGL, so it sits near a 180s budget and tips over when batched
    // with the other specs in one worker. Give it a comfortable margin.
    test.setTimeout(300_000);
    await bootDeterministic(page);
    await waitForDeal(page); // stream the block → loader generates faces + auto-deals

    // First-person; stand the player at the south seat so their own face-up hand
    // is right in front of them (the real way you'd sit down to a table).
    await page.evaluate(() => {
        const l = (window as any).loader;
        l.engine.setCameraView('first', true);   // snap: the click rays must start at the eye
        l.teleportSeptopus([2047, 2048], [8, 4.0, 2]);
    });
    await stepEngine(page, 25); // land + camera settle

    // Face north (yaw 0 → forward -Z), then tilt the gaze DOWN onto the hand. In
    // first person the pitch auto-levels unless locked, so Alt+ArrowDown (the
    // engine's pitch-lock) looks down and KEEPS looking down hands-free — exactly
    // how a player settles their view on their tiles before clicking.
    await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(0, 0, 0));
    await page.keyboard.down('Alt');
    await page.keyboard.down('ArrowDown');
    await stepEngine(page, 12);  // tilt ~22° down + _isPitchLocked = true (hand comfortably in frame)
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('Alt');
    await stepEngine(page, 3);   // render the locked view (raycast matrix becomes current)

    // Find the MIDDLE hand tile, project it to a pixel, and confirm the REAL
    // raycaster resolves that pixel to this very tile (visible + unoccluded).
    const aim = await page.evaluate(() => {
        const eng = (window as any).loader.engine;
        const w = eng.getWorld();
        const st = eng.mahjongState();
        const seat = st.humanSeat;
        const hand = st.hands[seat];
        const tid = hand[Math.floor(hand.length / 2)];
        let eid: any = null;
        for (const e of w.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
            if (w.getComponent(e, 'MahjongTileComponent').tileId === tid) { eid = e; break; }
        }
        const t = w.getComponent(eid, 'TransformComponent').position;
        const s = w.renderEngine.worldToScreen(t[0], t[1], t[2]);
        const hit = w.renderEngine.castRayFromCamera(s.x * 2 - 1, 1 - s.y * 2);
        return { tid, eid: String(eid), nx: s.x, ny: s.y, hit: hit ? String(hit.entityId) : null, turn: st.turn, seat };
    });
    expect(aim.turn, 'human to act').toBe(aim.seat);
    expect(aim.nx, 'tile on screen (x)').toBeGreaterThan(0.05); expect(aim.nx).toBeLessThan(0.95);
    expect(aim.ny, 'tile on screen (y)').toBeGreaterThan(0.05); expect(aim.ny).toBeLessThan(0.95);
    expect(aim.hit, 'a click at that pixel would hit this tile').toBe(aim.eid);
    await page.screenshot({ path: 'test-results/mahjong3d-fpv-before-click.png' });

    // The real thing: a DOM mouse click at the tile's pixel. Pitch stays locked so
    // the press doesn't disturb the view. FULL chain — DOM click → InputProvider →
    // RaycastInteractionSystem → interact.primary → MahjongSystem.discard. No API.
    const box = (await mainCanvas(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * aim.nx, box.y + box.height * aim.ny);
    await stepEngine(page, 5);

    const after = await page.evaluate(() => (window as any).loader.engine.mahjongState());
    expect(after.discards[aim.seat], 'the clicked tile was discarded').toContain(aim.tid);
    expect(after.turn, 'turn passed to the next seat').not.toBe(aim.seat);

    await page.screenshot({ path: 'test-results/mahjong3d-fpv-after-click.png' });
    // eslint-disable-next-line no-console
    console.log('MAHJONG3D-CLICK', JSON.stringify({ clicked: aim.tid, pixel: [aim.nx.toFixed(2), aim.ny.toFixed(2)], discards: after.discards[aim.seat] }));
});

test('3D mahjong: tiles are READABLE — each face-up tile shows its kind (slot-7 texture via CAS)', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);
    await waitForDeal(page); // the loader generated 34 face images + ingested them into the CAS

    // Every face-up tile (your open hand) references a content-addressed face image
    // in box slot 7; concealed opponents reference none.
    const faces = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const out: any[] = [];
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'AdjunctComponent'])) {
            const tc = w.getComponent(eid, 'MahjongTileComponent');
            const adj = w.getComponent(eid, 'AdjunctComponent');
            out.push({ kind: tc.kind, faceUp: tc.faceUp, tex: adj.stdData?.material?.texture ?? null });
        }
        return out;
    });
    const up = faces.filter((f) => f.faceUp);
    const down = faces.filter((f) => !f.faceUp);
    expect(up.length, 'the human hand is open').toBe(14);
    expect(up.every((f) => typeof f.tex === 'string' && f.tex.startsWith('bafk')), 'every open tile carries a CID face (real CIDv1)').toBe(true);
    expect(down.every((f) => f.tex == null), 'concealed tiles are blank').toBe(true);

    // The face CID really resolves through the content store (CAS roundtrip).
    const resolved = await page.evaluate(async (cid) => {
        const url = await (window as any).loader.engine.ipfs.toObjectUrl(cid);
        return typeof url === 'string' && url.length > 0;
    }, up[0].tex);
    expect(resolved, 'the face CID resolves to a loadable URL').toBe(true);

    // Let the textures finish loading onto the meshes, then capture the proof: a
    // top-down frame where the hand shows legible numbers/suits.
    await stepEngine(page, 20);
    await frameTable(page);
    await page.screenshot({ path: 'test-results/mahjong3d-readable-faces.png' });
    // eslint-disable-next-line no-console
    console.log('MAHJONG3D-FACES', JSON.stringify({ faceUp: up.length, concealed: down.length, sampleCid: up[0].tex.slice(0, 14) }));
});
