import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Floating title labels (e4 book / e5 board / e1 link) are proximity-gated in
// the render layer (MediaScreens.updateLabels): hidden beyond LABEL_MAX metres
// of the camera, fading in below it. Pure view policy — no data field, no
// simulation impact. This drives the REAL renderer: teleport the player far
// from / next to the demo book and read the sprite's visibility back out of
// the Three.js scene graph.

/** The demo book's label sprite state ({found, visible, opacity}) + its position. */
const bookLabel = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0x00e4) continue;
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

/** Hard-place the player at an engine-space position (test-only teleport). */
const placePlayer = (page: any, pos: number[]) => page.evaluate((p: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(pid, 'TransformComponent');
    t.position[0] = p[0]; t.position[1] = p[1]; t.position[2] = p[2];
}, pos);

test('标签近距门控:远处隐藏,走近书本才浮现', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    const label = await bookLabel(page);
    expect(label, 'the demo book has a floating title label sprite').not.toBeNull();

    // ── far: 20 m out → the label must be hidden ──────────────────────────────
    await placePlayer(page, [label.pos[0] + 20, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15); // > the 10-frame label throttle
    expect((await bookLabel(page)).visible, 'label hidden at 20 m').toBe(false);

    // ── near: 1.5 m out → the label shows ─────────────────────────────────────
    await placePlayer(page, [label.pos[0] + 1.5, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15);
    const near = await bookLabel(page);
    expect(near.visible, 'label visible up close').toBe(true);
    expect(near.opacity, 'readable (not faded out) up close').toBeGreaterThan(0.3);

    // ── walk away again: the gate re-hides it (not a one-shot reveal) ─────────
    await placePlayer(page, [label.pos[0] - 20, label.pos[1] + 1, label.pos[2]]);
    await stepEngine(page, 15);
    expect((await bookLabel(page)).visible, 'label re-hidden after leaving').toBe(false);
});
