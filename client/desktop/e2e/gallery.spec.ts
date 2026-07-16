import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine, walkUntil } from './helpers';

// The feature gallery (`?level=gallery`): a walkable south→north corridor, one
// engine feature per block, an e4 book at each entrance explaining it. Decomposes
// the crammed demo showcase into legible per-feature exhibits. Drives the REAL
// client: spawn at the south end facing north, confirm the exhibits exist, then
// walk north across a block seam (on-foot streaming) into the next exhibit.

const loc = (page: any) => page.evaluate(() => (window as any).loader.engine.getPlayerSeptopusLocation());

/** Count adjunct entities of a typeId across all loaded blocks (incl. derived). */
const countType = (page: any, typeId: number) => page.evaluate((t: number) => {
    const w = (window as any).loader.engine.getWorld();
    let n = 0;
    for (const e of w.getEntitiesWith(['AdjunctComponent'])) {
        if (w.getComponent(e, 'AdjunctComponent')?.stdData?.typeId === t) n++;
    }
    return n;
}, typeId);

test('功能展厅:出生朝北 → 每格一功能 + 入口书 → 走廊向北串块', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    // ── spawn at the south end of the hall ───────────────────────────────────
    const start = await loc(page);
    expect(start.block, 'spawned at the south end block').toEqual([2000, 1000]);

    // Opening exhibits: ① geometry primitives (cone/ball among the bricks) and
    // ② the soldier NPC (ba) sit in the first two blocks; the entrance books
    // (e4) are present across the loaded neighbourhood. (The b6 SPP hut moved
    // mid-hall to ⑫ [2000,1011] — complex exhibits no longer lead the walk.)
    expect(await countType(page, 0x00a6), '① geometry: the cone exhibit is in the spawn block').toBeGreaterThanOrEqual(1);
    expect(await countType(page, 0x00ba), '② the NPC agent is in the loaded neighbourhood').toBeGreaterThanOrEqual(1);
    expect(await countType(page, 0x00e4), 'entrance books exist in the loaded blocks').toBeGreaterThanOrEqual(2);
    expect(await countType(page, 0x00a8), 'floating a8 guide arrows chain down the hall').toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'test-results/gallery-0-spawn.png' });

    // ── walk NORTH down the hall — spawn faces north, so forward [0,1] = north ─
    // Crossing the block seam proves on-foot streaming of the next exhibit.
    const reached = await walkUntil(page, [0, 1], async () => (await loc(page)).block[1] >= 1001, 1200);
    const after = await loc(page);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 60);
    await page.screenshot({ path: 'test-results/gallery-1-northward.png' });

    expect(reached, `walking forward carried north into the next exhibit block (got ${JSON.stringify(after.block)})`).toBe(true);
    expect(after.block[1], 'advanced at least one block north').toBeGreaterThanOrEqual(1001);
});

test('功能展厅:触发门这一格可以走通(踩垫→门升起→穿过)', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);

    // Fast-travel onto the trigger-door exhibit (block index 3 = [2000,1003]),
    // south edge, then walk north: stepping on the pad raises the wall that bars
    // the lane, and the hall stays traversable (the one intentional gate).
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1003], [8, 2.5, 1.2]));
    await stepEngine(page, 60);
    expect((await loc(page)).block, 'on the trigger-door block').toEqual([2000, 1003]);

    const through = await walkUntil(page, [0, 1], async () => (await loc(page)).block[1] >= 1004, 1500);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 45);
    await page.screenshot({ path: 'test-results/gallery-2-door.png' });
    expect(through, `the pad-opened door let the walk continue north (at ${JSON.stringify((await loc(page)).block)})`).toBe(true);
});

test('⑧ 大喇叭开关:GLB 模型加载 + 点击 touch 开关经 sound 动作播 mp3', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);

    // Fast-travel to the audio exhibit, standing south-west of the pole looking
    // north — a three-quarter view so the screenshot shows the horn's profile.
    await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1007], [6.2, 6, 1.2]));
    await stepEngine(page, 60);

    // The loudspeaker GLB (resource 42) must actually fetch+parse+attach: the
    // authored root group is named 'loudspeaker' and survives the GLTF load —
    // its presence in the scene graph proves the swap-in happened (not the
    // placeholder box).
    let hasModel = false;
    for (let i = 0; i < 40 && !hasModel; i++) {
        await stepEngine(page, 10);
        await page.waitForTimeout(100);
        hasModel = await page.evaluate(() => {
            const w = (window as any).loader.engine.getWorld();
            let found = false;
            w.renderEngine.sceneInstance.traverse((o: any) => { if (o.name === 'loudspeaker') found = true; });
            return found;
        });
    }
    expect(hasModel, 'loudspeaker.glb swapped into the scene').toBe(true);

    // A REAL gesture first: SpatialAudio gates all decoding behind the browser
    // autoplay policy (pre-gesture plays only queue). A keydown unlocks it so
    // the switch below actually reaches fetch+decode, not just the queue.
    await page.keyboard.press('ShiftLeft');

    // Click the red switch the way the raycast reports it (same emit shape as
    // RaycastInteractionSystem) → the b8 touch node fires the sound action.
    const played = await page.evaluate(async () => {
        const loader = (window as any).loader;
        const w = loader.engine.getWorld();
        let payload: any = null;
        loader.engine.on('audio:played', (ev: any) => { payload = ev.payload ?? ev; });

        let touchEid: number | null = null;
        for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
            if (w.getComponent(eid, 'AdjunctComponent')?.adjunctId === 'adj_2000_1007_184_0') { touchEid = eid; break; }
        }
        const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        w.events.emit('interact.primary',
            { metadata: {}, distance: 2, point: [0, 0, 0] },
            { target: touchEid, actor: player });
        for (let i = 0; i < 5; i++) loader.engine.step(1 / 60);
        await new Promise(r => setTimeout(r, 300));   // let the mp3 fetch+decode kick off
        return payload;
    });
    expect(played?.target, 'sound action fired with the long-tune resource').toBe(41);

    // End-to-end proof the mp3 really decoded: SpatialAudio's buffer cache holds
    // the fetch+decodeAudioData promise per URL — the tune is ~51s of real audio,
    // so a >40s duration means the whole file round-tripped, not a stub.
    let duration = 0;
    for (let i = 0; i < 40 && !duration; i++) {
      await page.waitForTimeout(150);
      duration = await page.evaluate(async () => {
        const w = (window as any).loader.engine.getWorld();
        // The played URL may be a blob: from the content router — resolve id 41
        // the same way the actuator did and look THAT up in the decode cache.
        const url = await w.resourceManager.getAudioUrl(41);
        const bufs = (w.renderEngine as any).audio?.buffers as Map<string, Promise<AudioBuffer>> | undefined;
        const p = bufs?.get(url);
        return p ? (await p).duration : 0;
      });
    }
    expect(duration, 'mp3 fetched AND decoded by the browser').toBeGreaterThan(40);

    await stepEngine(page, 30);
    await page.screenshot({ path: 'test-results/gallery-8-loudspeaker.png' });
});
