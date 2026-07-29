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

    // While steering, the corner badges grey out — they frame the stick, so they
    // must not compete with it mid-move. Dimmed swaps the glass GRADIENT for a
    // flat grey wash, so the fill goes from `url(#…)` to a plain rgba().
    const BADGES = ['m-map-toggle', 'm-bag-toggle', 'm-avatar-toggle'];
    const badgeFill = (id: string) => page.getByTestId(id).locator('path').getAttribute('fill');
    const badgeStroke = (id: string) => page.getByTestId(id).locator('path').getAttribute('stroke');
    const dimmed = await Promise.all(BADGES.map(badgeFill));
    for (const f of dimmed) expect(f, `badge kept its glass while steering: ${f}`).toMatch(/^rgba\(/);

    await page.mouse.up();
    await stepEngine(page, 10);
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    expect(moved, `joystick walked the player (moved ${moved.toFixed(2)}m)`).toBeGreaterThan(0.5);

    // …and the glass comes back when the stick is released.
    const rested = await Promise.all(BADGES.map(badgeFill));
    for (const f of rested) expect(f, 'badge stayed greyed after release').toMatch(/^url\(/);
    // All three carry ONE tone: they are a frame around one control, not three
    // categories. (Checked on the stroke — each badge's gradient is a separate
    // element, so identical fills legitimately have different ids.)
    const strokes = await Promise.all(BADGES.map(badgeStroke));
    expect(new Set(strokes).size, 'idle badges must share one tone').toBe(1);

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

    // ── the two halves of this shell: LEFT = things you open, RIGHT = things you do ──

    // THREE corners frame the stick, each offset 5 px diagonally OUT from the
    // matching corner of its box — close enough to read as that corner, clear
    // enough not to touch it. Pinned because it is a deliberate offset, not
    // slack: a padding tweak that quietly closed or doubled it, or a badge that
    // drifted to a different corner, would change what the shape says.
    const mapBox = (await page.getByTestId('m-map-toggle').boundingBox())!;
    const bagBox = (await page.getByTestId('m-bag-toggle').boundingBox())!;
    const avatarBox = (await page.getByTestId('m-avatar-toggle').boundingBox())!;
    const stickBox = (await page.getByTestId('m-joystick').boundingBox())!;
    const R = (b: { x: number; width: number }) => b.x + b.width;   // right edge
    const B = (b: { y: number; height: number }) => b.y + b.height; // bottom edge
    expect(stickBox.y - mapBox.y, 'top-left: above the stick box').toBeCloseTo(5, 0);
    expect(stickBox.x - mapBox.x, 'top-left: left of the stick box').toBeCloseTo(5, 0);
    expect(stickBox.y - bagBox.y, 'top-right: above the stick box').toBeCloseTo(5, 0);
    expect(R(bagBox) - R(stickBox), 'top-right: right of the stick box').toBeCloseTo(5, 0);
    expect(B(avatarBox) - B(stickBox), 'bottom-right: below the stick box').toBeCloseTo(5, 0);
    expect(R(avatarBox) - R(stickBox), 'bottom-right: right of the stick box').toBeCloseTo(5, 0);
    // All three the same size, and smaller than an action key — they are hints
    // sitting around the stick, not a second set of controls.
    const jump = (await page.getByTestId('m-jump').boundingBox())!;
    for (const [name, b] of [['map', mapBox], ['bag', bagBox], ['avatar', avatarBox]] as const) {
        expect(b.height, `${name} corner outgrew an action key`).toBeLessThan(jump.height);
        expect(b.height, `${name} corner size differs`).toBeCloseTo(mapBox.height, 0);
    }

    // Every badge's box overlaps the stick's ring, but the bitten-out part must
    // let taps THROUGH — otherwise these corners silently steal the edges of the
    // drag area, since they are the layer above. Probe each badge's INNER corner
    // (the one facing the stick), which is exactly what the arc removes.
    const bite = (b: { x: number; y: number; width: number; height: number }, dx: number, dy: number) => page.evaluate(
        ([x, y]) => !!(document.elementFromPoint(x, y) as HTMLElement)?.closest('button[data-testid^="m-"]'),
        [b.x + (dx > 0 ? b.width - 6 : 6), b.y + (dy > 0 ? b.height - 6 : 6)]);
    expect(await bite(mapBox, 1, 1), 'top-left bite swallows taps').toBe(false);
    expect(await bite(bagBox, -1, 1), 'top-right bite swallows taps').toBe(false);
    expect(await bite(avatarBox, -1, -1), 'bottom-right bite swallows taps').toBe(false);

    // Each corner opens its own screen. Tap the DRAWN part: a badge's own centre
    // falls inside the quarter-circle bite, which is deliberately not a target.
    await page.getByTestId('m-bag-toggle').tap({ position: { x: 36, y: 8 } });
    await expect(page.getByTestId('m-bag-sheet')).toBeVisible();
    await page.getByTestId('m-bag-toggle').tap({ position: { x: 36, y: 8 } });
    await expect(page.getByTestId('m-bag-sheet')).not.toBeVisible();

    await page.getByTestId('m-map-toggle').tap({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('map2d')).toBeVisible();
    // On this narrow shell the shared page surface resolves to a bottom sheet.
    await expect(page.getByTestId('page-surface')).toHaveAttribute('data-variant', 'sheet');
    await page.getByTestId('page-close').tap();

    // ── the right-hand action cross: four verbs around one thumb pivot ────────
    // Asserted as a SHAPE, not as four positions: opposite arms share a centre
    // line and are equidistant from it. A button that drifted (or a layout that
    // silently collapsed to a column when one slot was empty) would break this
    // while every individual button still "worked".
    const padBoxes = Object.fromEntries(await Promise.all(
        (['m-edit-toggle', 'm-view-toggle', 'm-flashlight', 'm-jump'] as const)
            .map(async (id) => [id, (await page.getByTestId(id).boundingBox())!] as const)));
    const midX = (b: { x: number; width: number }) => b.x + b.width / 2;
    const midY = (b: { y: number; height: number }) => b.y + b.height / 2;
    const [top, left, right, bottom] = [padBoxes['m-edit-toggle'], padBoxes['m-view-toggle'],
        padBoxes['m-flashlight'], padBoxes['m-jump']];
    expect(Math.abs(midX(top) - midX(bottom)), 'top/bottom share a vertical axis').toBeLessThan(2);
    expect(Math.abs(midY(left) - midY(right)), 'left/right share a horizontal axis').toBeLessThan(2);
    expect(Math.abs(midX(top) - (midX(left) + midX(right)) / 2), 'cross is centred horizontally').toBeLessThan(2);
    expect(Math.abs(midY(left) - (midY(top) + midY(bottom)) / 2), 'cross is centred vertically').toBeLessThan(2);
    // JUMP takes the bottom slot — where a thumb rests.
    expect(midY(bottom), 'JUMP is the lowest of the four').toBeGreaterThan(midY(left));
    // …and the pad is clear of the joystick's half of the screen.
    expect(left.x, 'pad overlaps the joystick side').toBeGreaterThan(R(stickBox));

    // The engine owns the torch state — assert THAT, not the button's styling,
    // or the control could look on while nothing is lit.
    const torchOn = () => page.evaluate(() => (window as any).loader.flashlightOn());
    expect(await torchOn(), 'torch starts off').toBe(false);
    await page.getByTestId('m-flashlight').tap();
    expect(await torchOn(), 'tap lit the torch in the engine').toBe(true);
    await expect(page.getByTestId('m-flashlight')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('m-flashlight').tap();
    expect(await torchOn(), 'tapping again put it out').toBe(false);

    // …and the camera toggle still drives the shared view state.
    await page.getByTestId('m-view-toggle').tap();
    await expect(page.getByTestId('m-view-toggle')).toHaveAttribute('aria-label', /第一人称/);
    await page.getByTestId('m-view-toggle').tap();

    // Where AND when: the compass block carries the in-world clock + weather next
    // to the block coord (MiniCompass → loader.environmentInfo). Format is pinned
    // because it is the readout a player checks to see whether the day/night cycle
    // is running at all.
    await expect(page.getByTestId('mini-clock')).toHaveText(/^\d{2}:\d{2} [晴阴雨雪]\d?$/);

    // The map is still reachable from the compass too (glance up, tap, look).
    await page.getByTestId('mini-compass').tap();
    await expect(page.getByTestId('map2d')).toBeVisible();
    await page.getByTestId('page-close').tap();
    await page.screenshot({ path: 'test-results/mobile-1-final.png' });
});
