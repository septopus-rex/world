import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, playerPosition } from './helpers';

// The holdem table [2047,2047] gets a prominent, discoverable entrance: a
// static post (a2) + a slowly-spinning gold ball (a7, SignSpin) + a stationary
// dialogue anchor (ba npc) co-located with the ball. Clicking it shows a
// description + "进入游戏" button — the SAME player.enterGame action the
// existing walk-up corner button uses, now with lockMovement:true (seated
// gameplay: no wandering off mid-hand). Exercises dialogue → enterGame → real
// Game-mode entry + movement lock, then exitGame clearing it again.
// (GameRuntimeSystem's async session resolve — game.started → HoldemHUD, via
// the dev holdem server or its loopback fallback — is pre-existing Pattern-A
// plumbing this entrance doesn't touch; not re-verified here to keep this
// test independent of that network timing, which also races the generic
// exit-game button against the HUD's own leave button.)

const HOLDEM_BLOCK: [number, number] = [2047, 2047];
const GOLD = 13938487; // 0xd4af37 — the pillar's ball + npc core colour

const teleport = (page: any, block: [number, number], pos: [number, number, number]) =>
    page.evaluate(([b, p]: any) => (window as any).loader.teleportSeptopus(b, p), [block, pos] as any);

const mode = (page: any) => page.evaluate(() => String((window as any).loader.engine.getWorld().mode));
const moveLocked = (page: any) => page.evaluate(() => Boolean((window as any).loader.engine.getWorld().moveLocked));

/** Click (interact.primary) the npc found by its authored visual colour, with
 *  the player's REAL distance in the payload — same pattern as
 *  rpg-xianjian.spec.ts's clickNpc (the DialogueSystem gates on it, TALK_RANGE=3.5). */
const clickNpc = (page: any, color: number) => page.evaluate((c: number) => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const pt = w.getComponent(pid, 'TransformComponent');
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0xba || std?.visual?.color !== c) continue;
        const t = w.getComponent(eid, 'TransformComponent');
        const d = Math.hypot(t.position[0] - pt.position[0], t.position[2] - pt.position[2]);
        w.events.emit('interact.primary', { metadata: null, distance: d, point: [0, 0, 0] }, { target: eid, actor: pid });
        return d;
    }
    return -1;
}, color);

test('rotating pillar → dialogue → 进入游戏 enters the real holdem session with movement locked', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    // A couple metres south of the pillar (npc at local [3,13]) — in the zone
    // (Enter-Game corner button would show) but not yet in Game.
    await teleport(page, HOLDEM_BLOCK, [3, 11, 2]);
    await stepEngine(page, 10);
    expect(await mode(page)).toBe('normal');

    const dist = await clickNpc(page, GOLD);
    expect(dist, 'npc found, within talk range (TALK_RANGE=3.5)').toBeGreaterThanOrEqual(0);
    expect(dist).toBeLessThanOrEqual(3.5);
    await stepEngine(page, 3); // interact.primary is queued — needs a frame to process (DialogueSystem)

    const panel = page.getByTestId('dialogue-panel');
    await expect(panel, 'dialogue panel opened').toBeVisible();
    await expect(page.getByTestId('dialogue-text')).toContainText('德州扑克');
    await expect(page.getByTestId('dialogue-option-0')).toContainText('进入游戏');

    await page.getByTestId('dialogue-option-0').click();
    await stepEngine(page, 10);

    expect(await mode(page), 'the SAME enterGame contract the corner button uses').toBe('game');
    expect(await moveLocked(page), 'seated gameplay: movement locked').toBe(true);

    // Movement really is suppressed — hold forward, go nowhere.
    const before = await playerPosition(page);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));
    await stepEngine(page, 30);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    const after = await playerPosition(page);
    expect(Math.hypot(after[0] - before[0], after[2] - before[2]), 'locked: forward intent ignored').toBeLessThan(0.05);

    // Leave the session (exitGame — what a "leave"/"exit game" button calls
    // under the hood; WHICH button is current depends on whether
    // GameRuntimeSystem's async session resolve has landed yet, a race this
    // test doesn't need to referee — see the top-of-file note).
    await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        w.actuator.execute({ type: 'player', target: '', method: 'exitGame', params: [] }, { world: w, playerId: pid, mode: w.mode });
    });
    await stepEngine(page, 6);
    expect(await mode(page)).toBe('normal');
    expect(await moveLocked(page), 'cleared unconditionally on leaving Game').toBe(false);

    // And walking works again.
    const before2 = await playerPosition(page);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));
    await stepEngine(page, 30);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    const after2 = await playerPosition(page);
    expect(Math.hypot(after2[0] - before2[0], after2[2] - before2[2]), 'free to walk again').toBeGreaterThan(0.3);
});
