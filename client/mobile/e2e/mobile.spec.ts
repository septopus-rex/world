import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// The MOBILE shell (specs/mobile-client.md): same shared core (useEngine →
// loader → the pure-data world), different chrome + input affordances. This
// drives the REAL client under a touch-first viewport:
//   · boot `?ui=mobile` → mobile chrome, engine world renders
//   · virtual joystick (drag) → setPlayerMoveIntent → the player walks
//   · canvas touch-drag → engine-native look (InputProvider → CameraRig)
//   · JUMP button → vertical velocity
//   · bottom sheet toggles the shared bag / map panels

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const playerPos = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    return [...w.getComponent(pid, 'TransformComponent').position];
});
const cameraYaw = (page: any) => page.evaluate(() =>
    (window as any).loader.engine.getWorld().renderEngine.getMainCameraRotation()[1]);

test('移动壳:出生渲染 → 摇杆走路 → 触屏拖拽转视角 → JUMP → 底部抽屉', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await expect(page.getByTestId('mobile-app')).toBeVisible();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90); // settle: land on the ground

    // ── mobile chrome present, desktop chrome absent ──────────────────────────
    await expect(page.getByTestId('m-joystick')).toBeVisible();
    await expect(page.getByTestId('m-jump')).toBeVisible();
    await expect(page.getByTestId('status-toggle')).toHaveAttribute('aria-label', /normal/i);
    await expect(page.locator('[data-testid="mode-edit"]')).toHaveCount(0); // desktop toolbar not mounted
    await page.screenshot({ path: 'test-results/mobile-0-boot.png' });

    // ── virtual joystick: drag the stick UP (forward) and hold → player moves ─
    const p0 = await playerPos(page);
    const stick = page.getByTestId('m-joystick');
    const box = (await stick.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);          // Joystick handles mouse AND touch
    await page.mouse.down();
    await page.mouse.move(cx, cy - 40, { steps: 4 }); // up = forward (y inverted)
    await stepEngine(page, 60);             // hold the intent for 1s of sim
    const p1 = await playerPos(page);
    await page.mouse.up();
    await stepEngine(page, 10);
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    expect(moved, `joystick walked the player (moved ${moved.toFixed(2)}m)`).toBeGreaterThan(0.5);

    // ── engine-native touch look: dispatch a real touch drag on the canvas ────
    const yaw0 = await cameraYaw(page);
    await page.evaluate(() => {
        const canvas = document.querySelector('#three_demo canvas') as HTMLElement;
        const mk = (type: string, x: number, y: number) => {
            const touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
            canvas.dispatchEvent(new TouchEvent(type, {
                touches: type === 'touchend' ? [] : [touch],
                changedTouches: [touch], bubbles: true, cancelable: true,
            }));
        };
        mk('touchstart', 250, 300);
        for (let i = 1; i <= 8; i++) mk('touchmove', 250 + i * 12, 300);
        mk('touchend', 250 + 96, 300);
    });
    await stepEngine(page, 10);
    const yaw1 = await cameraYaw(page);
    expect(Math.abs(yaw1 - yaw0), `touch drag rotated the camera (Δ=${(yaw1 - yaw0).toFixed(3)})`).toBeGreaterThan(0.02);

    // ── JUMP: tap → the player leaves the ground ──────────────────────────────
    const g = await playerPos(page);
    await page.getByTestId('m-jump').tap();
    await stepEngine(page, 8);
    const air = await playerPos(page);
    expect(air[1] - g[1], 'jump lifted the player (engine Y)').toBeGreaterThan(0.1);
    await stepEngine(page, 90); // land again

    // ── bottom sheet: bag + map reuse the SHARED panels ───────────────────────
    await page.getByTestId('m-sheet-bag').tap();
    await expect(page.getByTestId('m-bag-sheet')).toBeVisible(); // shared InventoryPanel mounts inside (renders rows once items exist)
    await page.getByTestId('m-sheet-bag').tap();
    await page.getByTestId('m-sheet-map').tap();
    await expect(page.getByTestId('map2d')).toBeVisible();
    await page.getByTestId('map2d-close').tap();
    await page.screenshot({ path: 'test-results/mobile-1-final.png' });
});
