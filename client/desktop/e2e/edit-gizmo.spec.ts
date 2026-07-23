import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas } from './helpers';

// The 3DMax-style translate gizmo: placing (or clicking) an adjunct in Edit
// mode attaches XYZ drag arrows (render/TransformGizmo → TransformControls).
// This drives a REAL mouse drag on the X arrow and asserts the full authority
// chain: pointer → TransformControls → EditSystem.onGizmoChange (snap+clamp)
// → TransformComponent → release → ONE undoable 'set' → stdData → draft.
// Also pinned: while the gizmo is grabbed the camera must NOT orbit
// (world.isMovingObject gate) and the grab-click must not steal the selection.

async function aimDown(page: any) {
  await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    w.renderEngine.setMainCameraRotation(-0.9, 0, 0);
  });
  await stepEngine(page, 2);
}

async function selectedStd(page: any): Promise<any> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const edit = w.systems.findSystemByName('EditSystem') as any;
    const eid = edit.selectedEntityId;
    if (eid === null) return null;
    const adj = w.getComponent(eid, 'AdjunctComponent');
    return adj ? { eid, ox: adj.stdData.ox, oy: adj.stdData.oy, oz: adj.stdData.oz } : null;
  });
}

test('gizmo X-arrow drag moves the box, snaps to grid, persists to the draft', async ({ page }) => {
  await bootDeterministic(page);

  // Enter Edit, place a Box on the spawn pillar (same real-UI path as edit-ui).
  await page.locator('[data-testid="mode-edit"]').click();
  await stepEngine(page, 8);
  await page.locator('.sept-ui-group button', { hasText: 'Box' }).click();
  await aimDown(page);
  const box = await mainCanvas(page).boundingBox();
  const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.click(cx, cy);
  await stepEngine(page, 6); // AdjunctSystem builds the mesh → gizmo attaches next sync

  // The placement auto-selects the box and the gizmo is attached to it.
  const before = await selectedStd(page);
  expect(before, 'placement selected the new box').not.toBeNull();
  const info = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return w.renderEngine.gizmoInfo();
  });
  expect(info.attached, 'gizmo attached to the selection').toBe(true);
  expect(info.screen).toBeTruthy();

  // Grab the X arrow (screen coords are 0-1, y-down) and drag along its axis.
  // CRITICAL: no stepEngine between hover and mouse.down — the camera pitch
  // auto-levels a little every step (AUTO_LEVEL_SPEED), which moves the gizmo
  // on screen; the grab raycast must run against the same camera matrices the
  // grab point was computed from. (While the button is held, auto-level pauses
  // — isMouseDown keeps the pitch — so the drag itself is stable.)
  const toPx = (p: [number, number]) => ({ x: box!.x + p[0] * box!.width, y: box!.y + p[1] * box!.height });
  const o = toPx(info.screen.o), gx = toPx(info.screen.x);
  const dir = { x: gx.x - o.x, y: gx.y - o.y };
  // Scale the per-move stride by the arrow's own on-screen arm length so the
  // total drag covers several grid steps regardless of camera distance (a fixed
  // 12 px stride once mapped to <0.5 m world total — snapped back to the same
  // cell every move, i.e. "the drag did nothing").
  const len = Math.hypot(dir.x, dir.y) || 1;
  const stride = Math.max(20, len * 0.6);
  const step = { x: (dir.x / len) * stride, y: (dir.y / len) * stride };

  await page.mouse.move(gx.x, gx.y);          // hover: TransformControls picks axis 'X'
  await page.mouse.down();                    // same matrices → grabs the hovered arrow
  const grabbed = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return { ...w.renderEngine.gizmoInfo(), gated: w.isMovingObject };
  });
  expect(grabbed.axis, 'X arrow grabbed').toBe('X');
  expect(grabbed.dragging).toBe(true);
  expect(grabbed.gated, 'camera gate active while dragging').toBe(true);

  const camBefore = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return w.renderEngine.getMainCameraRotation();
  });
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(gx.x + step.x * i, gx.y + step.y * i);
    await stepEngine(page, 2);
  }
  // The drag never rotated the camera (isMovingObject gates CameraRig; sampled
  // before mouse.up because pitch auto-level resumes once the button releases).
  const camAfter = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return w.renderEngine.getMainCameraRotation();
  });
  expect(camAfter[0]).toBeCloseTo(camBefore[0], 5);
  expect(camAfter[1]).toBeCloseTo(camBefore[1], 5);

  await page.mouse.up();
  await stepEngine(page, 4);

  const after = await selectedStd(page);
  expect(after, 'grab-click did not steal the selection').not.toBeNull();
  expect(after.eid).toBe(before.eid);

  // Moved along X (east), snapped to the 0.5 m grid, inside the block.
  expect(after.ox).not.toBe(before.ox);
  for (const k of ['ox', 'oy', 'oz'] as const) {
    expect((after[k] * 2) % 1, `${k} on the 0.5 m grid`).toBeCloseTo(0, 6);
    expect(after[k]).toBeGreaterThanOrEqual(0);
    expect(after[k]).toBeLessThanOrEqual(16);
  }

  // The move is undoable (one history entry per completed drag).
  const undoCount = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return (w.systems.findSystemByName('EditSystem') as any).history.undoCount;
  });
  expect(undoCount).toBeGreaterThanOrEqual(1);

  // Exit Edit → the dragged position reaches the IndexedDB draft.
  await page.locator('[data-testid="mode-normal"]').click();
  await stepEngine(page, 5);
  const draftRow = await page.evaluate((want: { ox: number; oy: number; oz: number }) => {
    const draft = (window as any).loader.engine.getWorld().draftStore.load(0, 2048, 2048);
    const boxes = draft?.raw?.[2]?.find((g: any[]) => g[0] === 0x00a2)?.[1] ?? [];
    return boxes.find((r: any[]) =>
      Math.abs(r[1][0] - want.ox) < 1e-6 && Math.abs(r[1][1] - want.oy) < 1e-6 && Math.abs(r[1][2] - want.oz) < 1e-6,
    ) ?? null;
  }, { ox: after.ox, oy: after.oy, oz: after.oz });
  expect(draftRow, 'dragged position persisted into the block draft').not.toBeNull();
});
