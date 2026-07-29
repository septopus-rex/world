import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// Floating title labels are proximity-gated in the render layer
// (MediaScreens.updateLabels): hidden beyond LABEL_MAX metres of the camera,
// fading in below it. Pure view policy — no data field, no simulation impact.
// This drives the REAL renderer: teleport the player far from / next to the
// gallery's e5 board and read the sprite's visibility out of the scene graph.
//
// The host used to be the demo book. It is the BOARD now, because e4 book left
// the billboard behind in 2026-07 — its title is engraved on the cover plate
// instead (book-cover-title.spec.ts). Board and link still float theirs: a
// notice board's caption sits above a wall-mounted panel, where a billboard is
// the honest shape, and neither has a cover to print on.

const GALLERY_BOARD_BLOCK: [number, number] = [2000, 1017];

/** Boot the gallery, stop the clock, and stand next to the board. */
async function bootAtBoard(page: any): Promise<void> {
    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await page.evaluate((b: [number, number]) => (window as any).loader.teleportSeptopus(b, [8, 6, 1]), GALLERY_BOARD_BLOCK);
    await stepEngine(page, 60);
}

/** The board's label sprite state ({visible, opacity}) + the entity position. */
const boardLabel = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0x00e5) continue;
        const handle = w.getComponent(eid, 'MeshComponent')?.handle;
        let sprite: any = null;
        handle?.traverse?.((c: any) => { if (c.isSprite) sprite = c; });
        const t = w.getComponent(eid, 'TransformComponent');
        return sprite && {
            visible: sprite.visible,
            opacity: sprite.material.opacity,
            pos: [t.position[0], t.position[1], t.position[2]],
        };
    }
    return null;
});

/**
 * The board label's ACTUAL on-screen size, in CSS pixels — measured by
 * projecting the sprite's top and bottom edges through the real camera, NOT by
 * re-deriving MediaScreens' own formula (that would only assert it equals
 * itself). A sprite is screen-axis-aligned, so its vertical edge runs along the
 * camera's world up vector (matrixWorld column 1), and world scale is used so a
 * scaled parent would show up here rather than hide.
 */
const labelScreenPx = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const cam = w.renderEngine.mainCameraInstance;
    const vh = w.renderEngine.domElement.clientHeight;
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0x00e5) continue;
        const handle = w.getComponent(eid, 'MeshComponent')?.handle;
        let sprite: any = null;
        handle?.traverse?.((c: any) => { if (c.isSprite) sprite = c; });
        if (!sprite) return null;
        const V = () => sprite.position.clone();              // a THREE.Vector3, without importing three
        const pos = sprite.getWorldPosition(V());
        const scaleY = sprite.getWorldScale(V()).y;
        const m = cam.matrixWorld.elements;
        const up = V().set(m[4], m[5], m[6]).normalize();
        const top = pos.clone().addScaledVector(up, scaleY / 2).project(cam);
        const bot = pos.clone().addScaledVector(up, -scaleY / 2).project(cam);
        const spritePx = Math.abs(top.y - bot.y) * 0.5 * vh; // NDC spans -1..1 → ×½
        // View-space depth (what the projection actually divides by), measured
        // rather than inferred from the player's position: the third-person
        // camera sits some way behind the player, so "player 1.2 m from the
        // board" says nothing precise about the camera.
        const camPos = cam.getWorldPosition(V());
        const fwd = V().set(-m[8], -m[9], -m[10]).normalize();
        return {
            spritePx,
            textPx: spritePx * sprite.userData.__label.textFrac,
            localScaleY: sprite.scale.y,
            worldH: sprite.userData.__label.worldH,
            depth: pos.clone().sub(camPos).dot(fwd),
            viewportPx: vh,
        };
    }
    return null;
});

/** Hard-place the player at an engine-space position (test-only teleport). */
const placePlayer = (page: any, pos: number[]) => page.evaluate((p: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(pid, 'TransformComponent');
    t.position[0] = p[0]; t.position[1] = p[1]; t.position[2] = p[2];
}, pos);

test('标签近距门控:远处隐藏,走近留言板才浮现', async ({ page }) => {
    test.setTimeout(180_000);
    await bootAtBoard(page);

    const label = await boardLabel(page);
    expect(label, 'the gallery board has a floating title label sprite').not.toBeNull();

    // ── far: 20 m out → the label must be hidden ──────────────────────────────
    await placePlayer(page, [label.pos[0] + 20, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15); // > the 10-frame label throttle
    expect((await boardLabel(page)).visible, 'label hidden at 20 m').toBe(false);

    // ── near: 1.5 m out → the label shows ─────────────────────────────────────
    await placePlayer(page, [label.pos[0] + 1.5, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15);
    const near = await boardLabel(page);
    expect(near.visible, 'label visible up close').toBe(true);
    expect(near.opacity, 'readable (not faded out) up close').toBeGreaterThan(0.3);

    // ── walk away again: the gate re-hides it (not a one-shot reveal) ─────────
    await placePlayer(page, [label.pos[0] - 20, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15);
    expect((await boardLabel(page)).visible, 'label re-hidden after leaving').toBe(false);
});

test('标签固定物理尺寸:贴近读到约 20 CSS px,走动与改视口都不重算 scale', async ({ page }) => {
    test.setTimeout(180_000);
    // The reference viewport MediaScreens solves its world size against (a
    // portrait phone) — so the 20 px target is checkable here as literally 20 px.
    await page.setViewportSize({ width: 412, height: 900 });
    await bootAtBoard(page);

    const label = await boardLabel(page);
    expect(label, 'the gallery board has a floating title label sprite').not.toBeNull();

    // Walk right up to it: the reference reading distance. This is where the size
    // was solved for, and where the label used to fill half the screen.
    await placePlayer(page, [label.pos[0] + 1.2, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15); // > the 10-frame label throttle
    const near = await labelScreenPx(page);
    expect(near, 'label measurable on screen').not.toBeNull();
    // ±4 px: the third-person camera settles wherever it settles, so the actual
    // depth is near the 4.75 m reference, not exactly it. Both bounds matter —
    // too big was the bug, too small would be an unreadable caption.
    expect(near.textPx, `text height up close (viewport ${near.viewportPx} px, depth ${near.depth.toFixed(2)} m)`)
        .toBeGreaterThan(16);
    expect(near.textPx, 'and not the half-screen banner it used to be').toBeLessThan(24);
    // The sprite carries its ONE authored world size — not something re-solved.
    expect(near.localScaleY, 'sprite is at its fixed world height').toBeCloseTo(near.worldH, 6);

    // ── the actual complaint: size must not change as you move ────────────────
    // A per-frame pixel solve would rewrite scale here (and on a 10-frame
    // throttle you SEE it step). A sign has one size; only the projection moves.
    await placePlayer(page, [label.pos[0] + 3.4, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15);
    const moved = await labelScreenPx(page);
    expect(moved.localScaleY, 'world size unchanged after walking').toBe(near.localScaleY);

    // Same for a viewport resize: a physical sign does not re-cut itself when the
    // window changes, it just projects to fewer pixels — apparent size tracks the
    // viewport EXACTLY (±3 %), which no pixel-compensating scheme would do.
    await page.setViewportSize({ width: 412, height: 500 });
    // The canvas is sized by renderer.setSize (inline CSS px), not by layout, so
    // it only shrinks once the engine's resize handler has run — waiting on the
    // canvas itself rather than on setViewportSize returning.
    await page.waitForFunction(
        (h: number) => (window as any).loader.engine.getWorld().renderEngine.domElement.clientHeight < h,
        900, { timeout: 10_000 });
    await stepEngine(page, 15);
    const short = await labelScreenPx(page);
    expect(short.viewportPx, 'viewport really did shrink').toBeLessThan(moved.viewportPx);
    expect(short.localScaleY, 'world size unchanged after resize').toBe(near.localScaleY);
    expect(Math.abs(short.depth - moved.depth), 'camera did not move — only the viewport').toBeLessThan(0.5);
    expect(short.spritePx / moved.spritePx, 'apparent size scales with the viewport, nothing else')
        .toBeCloseTo(short.viewportPx / moved.viewportPx, 1);
});
