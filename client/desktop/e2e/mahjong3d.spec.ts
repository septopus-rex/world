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
    // (34 canvas→PNG→CAS), so we poll rather than assume a fixed step count.
    //
    // The whole poll runs INSIDE the page. It used to be a Playwright-side loop of
    // 200 iterations × 2 `page.evaluate` calls; with the parlour's ~160 meshes each
    // round trip costs enough that the 400 of them dominated the test — every spec
    // here blew a 5-minute budget while the simulation itself was fine. One round
    // trip now. The `await` every tenth frame yields to the event loop so the face
    // generation (real async work) can actually progress.
    await enterGameAt(page, [2047, 2048], [8, 8, 2]);
    const st = await page.evaluate(async () => {
        const eng = (window as any).loader.engine;
        for (let i = 0; i < 900; i++) {
            eng.step(1 / 60);
            const s = eng.mahjongState();
            if (s && s.phase === 'turn' && s.hands?.[s.humanSeat]?.length === 14) return s;
            if (i % 10 === 0) await new Promise((r) => setTimeout(r, 8));
        }
        return null;
    });
    if (!st) throw new Error('mahjong table never fully dealt');
    return st;
}

test('3D mahjong: the table deals in the client and a discard reveals a tile', async ({ page }) => {
    // The parlour (SPP feature faces + furniture + 53 tiles) is well over twice
    // the bare table's mesh count, and every one is a software-WebGL draw. Budget
    // against the SCENE, not against what the old empty room needed — a spec that
    // times out here also takes the dev server down with it, so the three after it
    // fail on ERR_CONNECTION_REFUSED and the real cause is two screens up.
    test.setTimeout(600_000);
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

    // Play a stretch of the hand. Seats now CALL on discards (碰/杠/吃), so the
    // old "every seat discards exactly N" no longer holds — a claimed tile LEAVES
    // the discard pile and joins a meld, and the claimer plays next out of order.
    // What must hold is that play advances and the felt stays consistent.
    // Run the rounds INSIDE the page: a per-round round-trip costs more than the
    // simulation does, and the parlour's mesh count makes each frame expensive
    // under software WebGL.
    const before = await page.evaluate((rounds) => {
        const eng = (window as any).loader.engine;
        const wall0 = eng.mahjongState().wall.length;
        for (let r = 0; r < rounds; r++) {
            const st = eng.mahjongState();
            if (st.phase === 'over') break;
            if (st.humanOffers.length > 0) eng.mahjongPass();
            else if (st.turn === st.humanSeat && st.phase === 'turn') eng.mahjongDiscard(st.hands[st.humanSeat][0]);
            for (let i = 0; i < 4; i++) eng.step(1 / 60);
        }
        return wall0;
    }, 12);

    const after = await page.evaluate(() => (window as any).loader.engine.mahjongState());
    expect(after.wall.length, 'the wall was drawn from').toBeLessThan(before);
    const totalDiscards = after.discards.reduce((a: number, d: number[]) => a + d.length, 0);
    const totalMelded = after.melds.reduce((a: number, m: any[]) => a + m.length, 0);
    expect(totalDiscards + totalMelded, 'tiles left hands and are visible on the felt').toBeGreaterThan(0);
    const pool = (await tilesState(page)).filter((t) => t.zone === 'discard');
    expect(pool.length, 'every discarded tile has an entity').toBe(totalDiscards);
    expect(pool.every((t) => t.faceUp), 'every discard is face-up').toBe(true);

    await frameTable(page);
    await page.screenshot({ path: 'test-results/mahjong3d-after-rounds.png' });
    // eslint-disable-next-line no-console
    console.log('MAHJONG3D', JSON.stringify({ dealt: racked.length, discards: after.discards.map((d: number[]) => d.length) }));
});

test('3D mahjong: a REAL mouse click on a hand tile discards it (truly playable)', async ({ page }) => {
    // Async 34-face CAS generation poll + FPV camera tilt + raycast verification
    // + a REAL DOM click, now over the parlour's mesh count. Measured ~4.7m.
    test.setTimeout(600_000);
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
    test.setTimeout(600_000);
    await bootDeterministic(page);
    await waitForDeal(page);

    // Tile art is a WORLD RESOURCE now, not table config: the client generates the
    // 34 faces + the back once at boot and injects them, so a table can deal before
    // the art lands (MahjongSystem then respawns the live tiles with it). The deal
    // no longer waits on 35 canvas→PNG→CAS round trips — which is most of why this
    // spec went from ~5 min to ~1 — but reading a FACE does, so wait for it here.
    await page.waitForFunction(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'AdjunctComponent'])) {
            const tc = w.getComponent(eid, 'MahjongTileComponent');
            if (!tc.faceUp) continue;
            return typeof w.getComponent(eid, 'AdjunctComponent').stdData?.material?.texture === 'string';
        }
        return false;
    }, null, { timeout: 120_000 });

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
    // Concealed tiles carry the tile BACK — one image shared by all of them, and
    // never a face (which would leak the opponents' hands through the texture).
    const backs = new Set(down.map((f) => f.tex));
    expect(backs.size, 'every concealed tile shows the same back').toBe(1);
    const backCid = [...backs][0];
    expect(typeof backCid === 'string' && backCid.startsWith('bafk'), 'the back is a real CID').toBe(true);
    expect(up.some((f) => f.tex === backCid), 'the back is not one of the faces').toBe(false);

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

test('3D mahjong: the HUD carries what the felt cannot — calls, progress, settlement', async ({ page }) => {
    // The most expensive spec here (~9 min measured): besides the usual boot +
    // deal, it PLAYS until the human is offered a call, which takes as many turns
    // as it takes — and every turn spawns and destroys textured tile meshes that
    // software WebGL pays full price for. Budgeted against the measurement, not
    // against hope; it earns the cost by covering the only path a player has to
    // 碰/杠/吃/胡 at all.
    test.setTimeout(600_000);
    await bootDeterministic(page);
    await waitForDeal(page);

    // The status strip is up as soon as a table is live.
    await expect(page.getByTestId('mahjong-table-hud')).toBeVisible();
    await expect(page.getByTestId('mj3d-wall')).toContainText('牌山');
    await expect(page.getByTestId('mj3d-progress')).toBeVisible();   // 聽牌 / N 向聽
    await expect(page.getByTestId('mj3d-turn')).toBeVisible();       // it's our turn to discard

    // Drive the hand until the human is OFFERED a call, or the hand settles. Both
    // are worth asserting: the call buttons are the only way a player can 碰/杠/吃,
    // and the settlement panel is the only place 番 is ever shown.
    // Drive to the FIRST moment the human is offered a call, in-page (see above on
    // round-trip cost), then hand control back so Playwright can assert on the
    // real buttons — the offer window is what a player can only reach through them.
    const upToOffer = await page.evaluate(() => {
        const eng = (window as any).loader.engine;
        for (let i = 0; i < 400; i++) {
            const st = eng.mahjongState();
            if (st.phase === 'over') return { stopped: 'over' as const };
            if (st.humanOffers.length > 0) return { stopped: 'offer' as const, action: st.humanOffers[0].action };
            if (st.turn === st.humanSeat && st.phase === 'turn') eng.mahjongDiscard(st.hands[st.humanSeat][0]);
            for (let k = 0; k < 3; k++) eng.step(1 / 60);
        }
        return { stopped: 'budget' as const };
    });

    const sawOffer = upToOffer.stopped === 'offer';
    if (sawOffer) {
        // The call buttons are the ONLY way a player can 碰/杠/吃/胡 — assert on the
        // rendered DOM, and take the call through a real click.
        await expect(page.getByTestId('mj3d-offers')).toBeVisible();
        await expect(page.getByTestId(`mj3d-claim-${upToOffer.action}`)).toBeVisible();
        // force: Playwright's stability check waits on requestAnimationFrame, and a
        // STOPPED engine in an idle headless compositor never produces one — the
        // same rAF starvation helpers.ts notes for its ready-wait. Visibility is
        // asserted above; the real-input path is covered by the mouse-click spec.
        await page.getByTestId(`mj3d-claim-${upToOffer.action}`).click({ force: true });
        await stepEngine(page, 3);
        const afterClaim = await page.evaluate(() => (window as any).loader.engine.mahjongState());
        expect(afterClaim.humanOffers.length, 'the click consumed the offer').toBe(0);
    }

    // End the hand and assert the settlement panel renders. We DRAIN THE WALL
    // rather than play it out: a full hand spawns/destroys ~140 textured meshes,
    // which under software WebGL costs minutes — and what e2e is for here is that
    // the panel renders, not that the 番 are right. The arithmetic (5 seeds, every
    // one a verifiable win with balanced books) is covered by the engine's
    // integration suite, where it runs headless in seconds.
    await page.evaluate(() => {
        const eng = (window as any).loader.engine;
        const st = eng.mahjongState();
        st.wall.length = 0;                 // next draw ends the hand (流局)
        for (let i = 0; i < 240; i++) {
            const s = eng.mahjongState();
            if (s.phase === 'over') break;
            if (s.humanOffers.length > 0) eng.mahjongPass();
            else if (s.turn === s.humanSeat && s.phase === 'turn') eng.mahjongDiscard(s.hands[s.humanSeat][0]);
            for (let k = 0; k < 3; k++) eng.step(1 / 60);
        }
    });
    await stepEngine(page, 2);

    const final = await page.evaluate(() => (window as any).loader.engine.mahjongState());
    expect(final.phase, 'the hand reached an ending').toBe('over');
    expect(final.result, 'every ending produces a result').toBeTruthy();

    // The settlement panel names the ending; a win also lists the 番 that scored.
    await expect(page.getByTestId('mj3d-result')).toBeVisible();
    if (final.result.kind !== 'draw') {
        await expect(page.getByTestId('mj3d-fan')).toContainText('番');
        expect(final.result.total, '番 was counted').toBeGreaterThanOrEqual(1);
        expect(final.result.delta.reduce((a: number, b: number) => a + b, 0), 'points balance').toBe(0);
    }
    await page.screenshot({ path: 'test-results/mahjong3d-settlement.png' });

    // eslint-disable-next-line no-console
    console.log('MAHJONG3D-HUD', JSON.stringify({
        sawOffer, ending: final.result.kind, fan: final.result.total,
        melds: final.melds.map((m: any[]) => m.length),
    }));
});
