import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas } from './helpers';

// Native 3D tumble tower (Jenga) in the REAL client — the first native game with
// a REAL rigid-body topple (TumbleSystem drives a scoped rapier world). Entry is
// trigger-borne (walk up to the tower → enterGame); the System builds a 15×3 stack
// of a2 box pieces, each a rigid body whose pose (position AND rotation) is synced
// to its mesh every frame. Pull the supports and it goes over under gravity. We
// SEE it: a standing-tower screenshot, then a fallen-tower screenshot afterwards.

const TUMBLE_BLOCK: [number, number] = [2049, 2049]; // NE of spawn

const mode = (p: any) => p.evaluate(() => (window as any).loader.engine.getWorld().mode);
const tumble = (p: any) => p.evaluate(() => (window as any).loader.engine.tumbleState());
const blockCount = (p: any) => p.evaluate(() =>
    (window as any).loader.engine.getWorld().getEntitiesWith(['TumbleBlockComponent']).length);
const teleport = (p: any, block: [number, number], pos: [number, number, number]) =>
    p.evaluate(([b, q]: any) => (window as any).loader.teleportSpp(b, q), [block, pos] as any);
// Pieces actually rotate (not just translate): a piece's local up-axis is tilted
// from world up. tumbleState().maxTilt (radians, yaw-invariant) reads this from the
// physics quaternions — STANDING ≈ 0 (upright at any yaw), FALLEN ≈ π/2 (on its
// side). That a piece's rotation differs from upright is exactly what VisualSync
// pushes onto the mesh, so it's the data behind the visible tumble in the shots.

/** Frame the whole tower from the south + slightly above (set the camera directly
 *  + render once — no step, so the follow-camera doesn't override it). */
async function frameTower(page: any) {
    await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        let cx = 0, cy = 0, cz = 0, n = 0, maxY = -1e9;
        for (const e of w.getEntitiesWith(['TumbleBlockComponent', 'TransformComponent'])) {
            const t = w.getComponent(e, 'TransformComponent').position;
            cx += t[0]; cy += t[1]; cz += t[2]; n++; maxY = Math.max(maxY, t[1]);
        }
        if (!n) return;
        cx /= n; cy /= n; cz /= n;
        const re = w.renderEngine;
        // 3/4 elevated view from the south-east so the whole tower + its cross-stacked
        // pattern is in shot and the avatar (due south at ground level) doesn't block it.
        re.setMainCameraPosition(cx + 3.4, cy + Math.max(1.6, maxY), cz + 3.4);
        re.setMainCameraLookAt(cx, cy, cz);
        re.render(false);
    });
}

/** Per-piece wood-tone overrides (proves the deferred setEntityColor recolour
 *  took): every standing piece carries a colorOverride, in two alternating tones. */
const woodColors = (p: any) => p.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    let withColor = 0; const tones = new Set<number>();
    for (const e of w.getEntitiesWith(['TumbleBlockComponent', 'MeshComponent'])) {
        const m = w.getComponent(e, 'MeshComponent');
        if (m.colorOverride != null) { withColor++; tones.add(m.colorOverride); }
    }
    return { withColor, tones: [...tones] };
});

test('tumble: trigger entry builds a rigid-body tower; a click pulls a piece; pulling the supports topples it', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    // 1. Stand in the playable block but SOUTH of the trigger volume (centred on the
    //    tower at [8,8]). We're in the zone but have NOT entered the game — no tower.
    await teleport(page, TUMBLE_BLOCK, [8, 3, 2]);
    await stepEngine(page, 10);
    expect(await mode(page), 'in the zone but not yet playing').toBe('normal');
    expect(await blockCount(page), 'no tower before entering').toBe(0);

    // 2. Walk UP to the tower (into the trigger). The b8 game trigger fires enterGame
    //    on the in-edge → Game → TumbleSystem builds the stack. rapier's WASM may
    //    still be loading on a cold boot, so poll for the full 45-piece tower.
    await teleport(page, TUMBLE_BLOCK, [8, 6, 2]);
    let built: any = null;
    for (let i = 0; i < 80; i++) {
        await stepEngine(page, 4);
        const s = await tumble(page);
        if (s && s.standing === 45) { built = s; break; }
    }
    expect(await mode(page), 'the trigger entered Game on its own').toBe('game');
    expect(built, 'the trigger built the rigid-body tower').not.toBeNull();
    expect(built.standing, '15 layers × 3 pieces').toBe(45);
    expect(built.toppled, 'a STABLE stack, not a spontaneous collapse').toBe(false);
    expect(built.maxY, 'tower stands near its authored ~2.1m top').toBeGreaterThan(1.8);
    // Let the stack settle, then confirm it's STILL standing + upright (a stable
    // tower, not a momentary spawn pose).
    await stepEngine(page, 90);
    const stood = await tumble(page);
    expect(stood.standing, 'still 45 pieces after settling').toBe(45);
    expect(stood.toppled, 'a STABLE stack, not a spontaneous collapse').toBe(false);
    expect(stood.maxTilt, 'pieces upright after settling (≈0 rad at any yaw)').toBeLessThan(0.12);
    const wood = await woodColors(page);
    expect(wood.withColor, 'every piece recoloured wood (deferred setEntityColor took)').toBe(45);
    expect(wood.tones.length, 'two alternating wood tones').toBe(2);
    await frameTower(page);
    await page.screenshot({ path: 'test-results/tumble3d-standing.png' });
    // eslint-disable-next-line no-console
    console.log('TUMBLE3D-STANDING', JSON.stringify({ standing: stood.standing, maxY: +stood.maxY.toFixed(2), maxTilt: +stood.maxTilt.toFixed(3), woodTones: wood.tones.length }));

    // 3. Pull the bottom layer down to a single EDGE block (build order is layer-
    //    major: layer0 = blockId 0,1,2). Removing 0 and 1 leaves only the +Z edge
    //    support, so the centre of mass sits well outside it → the tower MUST tip
    //    over under real physics. Driven no-aim (tumblePull) for a deterministic
    //    collapse — the same convenience shooting3d/mahjong3d use; the real click →
    //    pull chain (interact.primary → TumbleSystem.pull) is the seam shooting and
    //    mahjong already e2e-prove, and the headless pullById test drives it directly.
    await page.evaluate(() => {
        const e = (window as any).loader.engine;
        e.tumblePull(0); e.tumblePull(1);
    });
    await stepEngine(page, 240); // ~4s — let it go over and settle on the ground
    const fell = await tumble(page);
    expect(fell.toppled, 'the tower toppled under gravity').toBe(true);
    expect(fell.maxY, 'the top dropped a long way').toBeLessThan(built.maxY - 0.5);
    // The decisive render proof: pieces are now tipped onto their sides — tilt went
    // from ~0 (upright) to ~π/2, i.e. the rapier quaternions drove the meshes'
    // ROTATION, not just their position. (Position-only sync, like pool's balls,
    // could never show this.)
    expect(fell.maxTilt, 'pieces tipped over — rotation synced from the physics').toBeGreaterThan(0.6);
    await frameTower(page);
    await page.screenshot({ path: 'test-results/tumble3d-toppled.png' });
    // eslint-disable-next-line no-console
    console.log('TUMBLE3D-TOPPLED', JSON.stringify({ standing: fell.standing, maxY: +fell.maxY.toFixed(2), toppled: fell.toppled, maxTilt: +fell.maxTilt.toFixed(2) }));
    expect(await mainCanvas(page).count()).toBe(1);
});
