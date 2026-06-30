import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas } from './helpers';

// Native 3D shooting range (ShootingRangeSystem) in the REAL client: the range
// block streams in, the loader spawns the sphere targets as adjunct entities, and
// a REAL first-person mouse click on a target scores AND flips it red in place —
// the runtime-recolour channel pool/mahjong both dodged. The proof is the live
// Three.js material colour: the clicked target turns red, the others stay green
// (per-object isolation), so recolouring one never bleeds across shared materials.

const UP = 0x33cc44;   // live green (ShootingRangeSystem default)
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

// Stream the range block + wait for the loader's setup to spawn the targets.
async function waitForRange(page: any) {
    for (let i = 0; i < 60; i++) {
        await stepEngine(page, 2);
        const st = await page.evaluate(() => (window as any).loader.engine.shootingState());
        if (st && st.targets.length > 0) return st;
    }
    throw new Error('shooting range never set up');
}

test('3D shooting: a REAL click scores AND recolours the target red in place', async ({ page }) => {
    test.setTimeout(180_000); // software WebGL + many meshes is slow
    await bootDeterministic(page);
    const st0 = await waitForRange(page);
    expect(st0.targetCount).toBe(5);
    expect(st0.phase).toBe('running');
    expect([st0.score, st0.shots, st0.hits]).toEqual([0, 0, 0]);

    // Stand at the firing line (block 2048,2047), first person, facing north (yaw 0
    // → forward -Z) so the target row is straight ahead at eye height.
    await page.evaluate(() => {
        const l = (window as any).loader;
        l.engine.setCameraView('first');
        l.teleportSpp([2048, 2047], [8, 6.0, 2]);
    });
    await stepEngine(page, 25); // land + settle
    await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(0, 0, 0));
    await stepEngine(page, 3);

    // Before: every target renders LIVE GREEN.
    const before = await targetHexes(page);
    expect(Object.values(before).every((h) => h === UP), 'all targets start green').toBe(true);
    await page.screenshot({ path: 'test-results/shooting3d-before.png' });

    // Project target 2 (the middle) to a screen pixel. The targets sit a touch
    // below the standing eye line, so tilt the gaze DOWN until it's centred — the
    // engine's pitch-lock (Alt+ArrowDown) holds the view hands-free for the click,
    // exactly how a player settles their aim. Adaptive so it's eye-height agnostic.
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
    await stepEngine(page, 3); // render the locked view (raycast matrix becomes current)
    aim = await screenOf(2);

    expect(aim.nx, 'target on screen (x)').toBeGreaterThan(0.05); expect(aim.nx).toBeLessThan(0.95);
    expect(aim.ny, 'target on screen (y)').toBeGreaterThan(0.05); expect(aim.ny).toBeLessThan(0.95);
    expect(aim.hit, 'a click at that pixel would hit target 2').toBe(aim.eid);

    // The real thing: a DOM mouse click at the target's pixel. FULL chain — DOM
    // click → InputProvider → RaycastInteractionSystem → interact.primary →
    // ShootingRangeSystem.fireAtEntity. No API.
    const box = (await mainCanvas(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * aim.nx, box.y + box.height * aim.ny);
    await stepEngine(page, 5);

    // Scored, and target 2 is now logically 'hit'.
    const st1 = await page.evaluate(() => (window as any).loader.engine.shootingState());
    expect([st1.score, st1.hits], 'the click scored').toEqual([1, 1]);
    expect(st1.shots).toBeGreaterThanOrEqual(1);
    expect(st1.targets.find((t: any) => t.targetId === 2).state).toBe('hit');

    // RUNTIME RECOLOUR + ISOLATION: target 2 renders RED, every other target is
    // still GREEN (recolouring one didn't bleed across the shared palette material).
    const after = await targetHexes(page);
    expect(after[2], 'clicked target turned red').toBe(HIT);
    expect([0, 1, 3, 4].every((id) => after[id] === UP), 'other targets stayed green (no bleed)').toBe(true);
    await page.screenshot({ path: 'test-results/shooting3d-after.png' });

    // eslint-disable-next-line no-console
    console.log('SHOOTING3D', JSON.stringify({ score: st1.score, pixel: [aim.nx.toFixed(2), aim.ny.toFixed(2)], hit2: after[2].toString(16), others: [0, 1, 3, 4].map((i) => after[i].toString(16)) }));
});
