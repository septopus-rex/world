import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas } from './helpers';

// The CORRECTED game-mode (docs/systems/game-mode-entry.md): entry is borne by an
// in-world GAME TRIGGER (walk up to the table → enterGame), NOT a client button;
// and each game declares a per-game exitPolicy. This drives the REAL client:
//   1. shooting (ephemeral): walking into the range trigger ENTERS Game + spawns
//      the targets — with NO setMode() call (pure trigger-borne entry).
//   2. mahjong (confirm): stepping off the table block does NOT silently exit —
//      it raises the "leave game?" dialog; confirming exits, and the round is
//      held alive until then.

const RANGE_BLOCK: [number, number] = [2048, 2047];   // shooting (ephemeral)
const MAHJONG_BLOCK: [number, number] = [2047, 2048]; // native mahjong (confirm)

const mode = (page: any) => page.evaluate(() => (window as any).loader.engine.getWorld().mode);
const targetCount = (page: any) => page.evaluate(() =>
    (window as any).loader.engine.getWorld().getEntitiesWith(['ShootingTargetComponent']).length);
const teleport = (page: any, block: [number, number], pos: [number, number, number]) =>
    page.evaluate(([b, p]) => (window as any).loader.teleportSeptopus(b, p), [block, pos] as any);

test('trigger-borne entry: walking into the range trigger enters Game + spawns targets (no setMode)', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    // Stand on the range block but SOUTH of the trigger volume (centred at [8,9.5]).
    // We are in a playable zone (the Enter-Game button would show) but have NOT
    // entered the game — no targets yet.
    await teleport(page, RANGE_BLOCK, [8, 5.5, 2]);
    await stepEngine(page, 10);
    expect(await mode(page), 'in the zone but not yet in Game').toBe('normal');
    expect(await targetCount(page), 'no targets before stepping into the trigger').toBe(0);
    await expect(page.locator('[data-testid="enter-game"]'), 'playable-zone affordance shown').toBeVisible();

    // Walk INTO the trigger volume (step north onto the firing mark). The b8 game
    // trigger fires enterGame on the in-edge → Game mode → ShootingRangeSystem
    // spawns the round. Crucially: the test never calls setMode — the TRIGGER did it.
    await teleport(page, RANGE_BLOCK, [8, 9.5, 2]);
    await stepEngine(page, 6);
    expect(await mode(page), 'the trigger entered Game on its own').toBe('game');
    expect(await targetCount(page), 'targets spawned on trigger entry').toBe(5);

    // eslint-disable-next-line no-console
    console.log('GAME-TRIGGER-ENTRY', JSON.stringify({ enteredVia: 'trigger', targets: await targetCount(page) }));
});

test("confirm exitPolicy: stepping off the mahjong block raises the leave dialog, not a silent exit", async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    // Be in the mahjong block but OFF the table trigger (centred at [8,8]); zone
    // active, not yet in Game.
    await teleport(page, MAHJONG_BLOCK, [8, 3, 2]);
    await stepEngine(page, 10);
    expect(await mode(page)).toBe('normal');

    // Sit down at the table → the b8 trigger fires enterGame({exitPolicy:'confirm'}).
    await teleport(page, MAHJONG_BLOCK, [8, 8, 2]);
    await stepEngine(page, 8);
    expect(await mode(page), 'sitting at the table entered Game via the trigger').toBe('game');
    // No leave dialog while we're still on the block.
    await expect(page.locator('[data-testid="leave-game-confirm"]')).toHaveCount(0);

    // Step OFF the block (east, onto the non-game spawn block). Under 'confirm' the
    // engine keeps the round alive and emits game.leave_intent → the client shows
    // the dialog; mode stays Game (NOT the silent ephemeral auto-exit).
    await teleport(page, [2048, 2048], [8, 8, 2]);
    await stepEngine(page, 6);
    expect(await mode(page), "confirm policy: round held alive, still in Game").toBe('game');
    await expect(page.locator('[data-testid="leave-game-confirm"]'), 'leave-game dialog raised').toBeVisible();

    // Confirm the leave → exit Game; the dialog clears.
    await page.locator('[data-testid="leave-game-confirm-yes"]').click();
    await stepEngine(page, 4);
    expect(await mode(page), 'confirming left Game').toBe('normal');
    await expect(page.locator('[data-testid="leave-game-confirm"]')).toHaveCount(0);

    // eslint-disable-next-line no-console
    console.log('GAME-TRIGGER-CONFIRM', JSON.stringify({ confirmed: true }));
    // keep the canvas handle referenced (parity with other specs)
    expect(await mainCanvas(page).count()).toBe(1);
});
