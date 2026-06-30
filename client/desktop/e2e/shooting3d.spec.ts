import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas, enterGameAt } from './helpers';

// Native 3D shooting range (ShootingRangeSystem) in the REAL client — the full
// ZONE-GATED lifecycle (#3) plus the runtime-recolour channel (#1):
//   1. walk onto the range block → "Enter Game" affordance, no targets yet
//   2. enter Game → targets spawn as adjunct entities
//   3. a REAL first-person click scores AND flips the target red in place (the
//      others stay green — per-object material isolation, no bleed)
//   4. leave Game → targets + scoreboard torn down (nothing left to evict)

const RANGE_BLOCK: [number, number] = [2048, 2047];
const UP = 0x33cc44;   // live green
const HIT = 0xff3322;  // hit red

// Read the live rendered material colour of every target, keyed by targetId.
function targetHexes(page: any) {
    return page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const out: Record<number, number | null> = {};
        for (const eid of w.getEntitiesWith(['ShootingTargetComponent', 'MeshComponent'])) {
            const tc = w.getComponent(eid, 'ShootingTargetComponent');
            const mesh = w.getComponent(eid, 'MeshComponent');
            let hex: number | null = null;
            mesh.handle?.traverse?.((o: any) => { if (o.isMesh && o.material) hex = o.material.color.getHex(); });
            out[tc.targetId] = hex;
        }
        return out;
    });
}

const targetCount = (page: any) => page.evaluate(() =>
    (window as any).loader.engine.getWorld().getEntitiesWith(['ShootingTargetComponent']).length);

test('3D shooting: zone-gated — enter Game to spawn, click to recolour, leave to tear down', async ({ page }) => {
    test.setTimeout(180_000); // software WebGL + many meshes is slow
    await bootDeterministic(page);

    // Walk onto the range block (south of spawn). In Normal mode it's just furniture
    // — no targets yet — and the explicit "Enter Game" affordance appears.
    await page.evaluate(([b]) => (window as any).loader.teleportSpp(b, [8, 6.0, 2]), [RANGE_BLOCK] as any);
    await stepEngine(page, 12);
    expect(await targetCount(page), 'no targets before entering Game').toBe(0);
    await expect(page.locator('[data-testid="enter-game"]'), 'Enter Game affordance shown in the zone').toBeVisible();

    // Explicit entry → the ShootingRangeSystem spawns the round.
    const entered = await page.evaluate(() => (window as any).loader.setMode('game'));
    expect(entered, 'entering Game succeeded (in a game zone)').toBe(true);
    await stepEngine(page, 4);
    const st0 = await page.evaluate(() => (window as any).loader.engine.shootingState());
    expect(st0.targetCount).toBe(5);
    expect([st0.score, st0.shots, st0.hits]).toEqual([0, 0, 0]);
    expect(await targetCount(page)).toBe(5);

    // Face north (yaw 0 → forward -Z) so the target row is straight ahead.
    await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(0, 0, 0));
    await stepEngine(page, 3);
    const before = await targetHexes(page);
    expect(Object.values(before).every((h) => h === UP), 'all targets start green').toBe(true);
    await page.screenshot({ path: 'test-results/shooting3d-before.png' });

    // Aim at the middle target (id 2): tilt the gaze DOWN (pitch-lock) until it's
    // centred — eye-height agnostic — then confirm the raycaster resolves to it.
    const screenOf = (id: number) => page.evaluate((tid) => {
        const w = (window as any).loader.engine.getWorld();
        let eid: any = null;
        for (const e of w.getEntitiesWith(['ShootingTargetComponent', 'TransformComponent'])) {
            if (w.getComponent(e, 'ShootingTargetComponent').targetId === tid) { eid = e; break; }
        }
        const t = w.getComponent(eid, 'TransformComponent').position;
        const s = w.renderEngine.worldToScreen(t[0], t[1], t[2]);
        const hit = w.renderEngine.castRayFromCamera(s.x * 2 - 1, 1 - s.y * 2);
        return { eid: String(eid), nx: s.x, ny: s.y, hit: hit ? String(hit.entityId) : null };
    }, id);

    await page.keyboard.down('Alt');
    await page.keyboard.down('ArrowDown');
    let aim = await screenOf(2);
    for (let i = 0; i < 30 && aim.ny > 0.6; i++) { await stepEngine(page, 2); aim = await screenOf(2); }
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('Alt');
    await stepEngine(page, 3);
    aim = await screenOf(2);
    expect(aim.nx, 'target on screen (x)').toBeGreaterThan(0.05); expect(aim.nx).toBeLessThan(0.95);
    expect(aim.ny, 'target on screen (y)').toBeGreaterThan(0.05); expect(aim.ny).toBeLessThan(0.95);
    expect(aim.hit, 'a click at that pixel would hit target 2').toBe(aim.eid);

    // The real thing: a DOM mouse click. FULL chain — DOM click → InputProvider →
    // RaycastInteractionSystem → interact.primary → ShootingRangeSystem.fireAtEntity.
    const box = (await mainCanvas(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * aim.nx, box.y + box.height * aim.ny);
    await stepEngine(page, 5);

    const st1 = await page.evaluate(() => (window as any).loader.engine.shootingState());
    expect([st1.score, st1.hits], 'the click scored').toEqual([1, 1]);
    expect(st1.targets.find((t: any) => t.targetId === 2).state).toBe('hit');

    // RUNTIME RECOLOUR + ISOLATION: target 2 renders RED, the others stay GREEN.
    const after = await targetHexes(page);
    expect(after[2], 'clicked target turned red').toBe(HIT);
    expect([0, 1, 3, 4].every((id) => after[id] === UP), 'other targets stayed green (no bleed)').toBe(true);
    await page.screenshot({ path: 'test-results/shooting3d-after.png' });

    // Leave Game (the generic exit, as walking out of the zone would auto-do) →
    // the session + every target is torn down: nothing dangling, nothing to evict.
    const left = await page.evaluate(() => (window as any).loader.setMode('normal'));
    expect(left).toBe(true);
    await stepEngine(page, 3);
    expect(await page.evaluate(() => (window as any).loader.engine.shootingState()), 'session gone').toBeNull();
    expect(await targetCount(page), 'targets torn down on exit').toBe(0);

    // eslint-disable-next-line no-console
    console.log('SHOOTING3D', JSON.stringify({ spawned: st0.targetCount, score: st1.score, hit2: after[2].toString(16), others: [0, 1, 3, 4].map((i) => after[i].toString(16)), tornDown: true }));
});

test('3D shooting: WALKING out of the zone auto-exits Game and tears the round down; walking back re-arms a fresh round', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    // Stand on the range block, face north (yaw 0), enter Game → 5 targets spawn.
    await page.evaluate(([b]) => (window as any).loader.teleportSpp(b, [8, 6.0, 2]), [RANGE_BLOCK] as any);
    await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(0, 0, 0));
    await stepEngine(page, 8);
    expect(await page.evaluate(() => (window as any).loader.setMode('game')), 'entered Game in the zone').toBe(true);
    await stepEngine(page, 4);
    expect(await targetCount(page), '5 targets after entering').toBe(5);

    // Score a hit, so re-entry can be PROVEN fresh (not a resumed round).
    expect(await page.evaluate(() => (window as any).loader.engine.shootingFire(2))).toBe('hit');
    await stepEngine(page, 2);
    expect((await page.evaluate(() => (window as any).loader.engine.shootingState())).hits, 'one hit on the books').toBe(1);

    const loc0 = await page.evaluate(() => (window as any).loader.engine.getPlayerSppLocation());
    expect(loc0.block, 'standing on the range block').toEqual(RANGE_BLOCK);

    // WALK EAST (yaw 0 → intent (1,0) is +X = east, the open side — furniture is
    // N/S) until the player crosses off the range block. NO setMode call: the exit
    // must be driven purely by leaving the zone, exactly as "走出一定范围就退出".
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(1, 0));
    let loc = loc0, crossed = false;
    for (let i = 0; i < 80 && !crossed; i++) {
        await stepEngine(page, 8);
        loc = await page.evaluate(() => (window as any).loader.engine.getPlayerSppLocation());
        crossed = loc.block[0] !== RANGE_BLOCK[0] || loc.block[1] !== RANGE_BLOCK[1];
    }
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    expect(crossed, `walked off the range block (now on ${JSON.stringify(loc.block)})`).toBe(true);
    await stepEngine(page, 4);

    // Walking out ALONE flipped the mode back and tore the whole round down — no
    // setMode, no eviction (the neighbour block is still in the 5×5 window).
    const mode = await page.evaluate(() => (window as any).loader.engine.getWorld().mode);
    expect(mode, 'leaving the zone auto-reverted to Normal').toBe('normal');
    expect(await targetCount(page), 'targets torn down by walking out').toBe(0);
    expect(await page.evaluate(() => (window as any).loader.engine.shootingState()), 'session gone').toBeNull();

    // WALK BACK WEST onto the range block → the zone re-activates (Enter Game shows).
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(-1, 0));
    let back = false;
    for (let i = 0; i < 80 && !back; i++) {
        await stepEngine(page, 8);
        const l = await page.evaluate(() => (window as any).loader.engine.getPlayerSppLocation());
        back = l.block[0] === RANGE_BLOCK[0] && l.block[1] === RANGE_BLOCK[1];
    }
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    expect(back, 'walked back onto the range block').toBe(true);
    await stepEngine(page, 6);
    await expect(page.locator('[data-testid="enter-game"]'), 'Enter Game shown again on return').toBeVisible();

    // Re-enter → a FRESH round: 5 targets, scoreboard back to zero (the armed config
    // survived the walk-out, but the previous hit did NOT carry over).
    let reentered = false;
    for (let i = 0; i < 12 && !reentered; i++) {
        await stepEngine(page, 3);
        reentered = await page.evaluate(() => {
            const l = (window as any).loader;
            return l.engine.getWorld().mode === 'game' ? true : l.setMode('game');
        });
    }
    expect(reentered, 're-entered Game on return').toBe(true);
    await stepEngine(page, 4);
    const fresh = await page.evaluate(() => (window as any).loader.engine.shootingState());
    expect(fresh.targetCount).toBe(5);
    expect([fresh.score, fresh.shots, fresh.hits], 'fresh round resets the scoreboard').toEqual([0, 0, 0]);
    expect(await targetCount(page), '5 fresh targets respawned').toBe(5);

    // eslint-disable-next-line no-console
    console.log('SHOOTING3D-WALKOUT', JSON.stringify({ leftAt: loc.block, modeAfterWalkout: mode, reentryTargets: fresh.targetCount, reentryHits: fresh.hits }));
});
