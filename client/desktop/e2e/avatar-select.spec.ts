import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, waitForWorldReady } from './helpers';

// Avatar selection + the avatar-animation contract, live in the client:
//  • soldier (33, three.js example): clips Idle/Run/Walk — the NORMATIVE
//    case-insensitive name-equality mapping;
//  • robot (34, RobotExpressive): clips Idle/Walking/Running/Jump — the LEGACY
//    substring heuristics (Walking→walk) + air mapping;
//  • body parameters: every avatar is uniform-scaled to the 1.8 m body height
//    with its feet planted on the ground (footOffset), collider untouched;
//  • the pick persists across reload (DraftStore meta).

const info = (page: any) => page.evaluate(() => (window as any).loader.engine.avatarInfo());

// Wait for a specific clip to REGISTER — `av.resource` is set optimistically the
// instant setAvatar is called (before the async model load resolves), so keying
// on resource alone reads the old body's mixer. Key on the new avatar's own clip.
const waitAvatar = async (page: any, resource: string, clip: string) => {
    await page.waitForFunction(({ res, c }: { res: string; c: string }) => {
        const i = (window as any).loader.engine.avatarInfo();
        return !!i && i.resource === res && i.height > 1 && i.clips.includes(c);
    }, { res: resource, c: clip }, { timeout: 30_000, polling: 250 });
};

/** Hold a north walk intent until the animation state reaches walk/run (or a
 *  frame budget elapses). Returns the live info at stop. Robust to the exact
 *  frame the player crosses the walk-speed threshold / finishes settling after
 *  a swap. Intent stays held so the caller reads a genuine mid-walk state. */
const walkToMotion = async (page: any, maxFrames = 240) => {
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));
    let i: any = null;
    for (let f = 0; f < maxFrames; f += 15) {
        await stepEngine(page, 15);
        i = await info(page);
        if (/walk|run/.test(i?.state ?? '')) break;
    }
    return i;
};
const stand = async (page: any) => {
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    await stepEngine(page, 60); // let the state machine settle back to idle
};

test('化身选择:两套动作契约 + 身体参数 + 重载持久', async ({ page }) => {
    test.setTimeout(300_000);
    await bootDeterministic(page);

    // ── default avatar: single UNNAMED clip — the clips[0]→idle net keeps it
    // animating (this is why "没有动画" was an asset problem, not an engine one).
    // A mixer exists with a live state → the engine's animation link works even
    // for a one-clip asset. (State may be air/idle depending on settle timing.)
    const d0 = await info(page);
    expect(d0.clips.length, 'default avatar has a registered mixer').toBeGreaterThanOrEqual(1);
    expect(d0.state, 'the state machine is running').not.toBeNull();

    // ── soldier: normative name-equality mapping ─────────────────────────────
    await page.getByTestId('avatar-picker-toggle').click();
    await page.getByTestId('avatar-option-33').click();
    await waitAvatar(page, '33', 'Walk');

    let i = await info(page);
    expect(i.clips, 'soldier clip set').toEqual(expect.arrayContaining(['Idle', 'Walk', 'Run']));
    expect(i.height, 'scaled to the 1.8 m body').toBeGreaterThan(1.5);
    expect(i.height).toBeLessThan(2.1);
    // Body-parameter check: the controller plants feet at feetY − footOffset, so a
    // finite footOffset within a body height proves the scale-to-1.8 + foot-plant
    // ran (the live skinned-mesh Box3 min.y is unreliable, hence footOffset).
    expect(i.footOffset, 'foot offset derived').not.toBeNull();
    expect(Math.abs(i.footOffset)).toBeLessThan(2);
    expect(i.state).toBe('idle');
    expect(i.activeClip, 'idle state resolved by NAME EQUALITY').toBe('Idle');

    i = await walkToMotion(page);
    expect(i.state, 'movement drove the state machine').toMatch(/walk|run/);
    expect(i.activeClip, 'walk/run resolved by NAME EQUALITY').toMatch(/Walk|Run/);
    // The clip must ADVANCE, not freeze: the grounded flag flickers every frame
    // on flat ground, and without air-coyote debounce the state thrashed walk↔air
    // and reset the clip to frame 0 forever (the "stiff avatar"). Sample the mixer
    // time across a few frames — it must move and stay running.
    const t0 = (await info(page)).activeTime;
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));
    await stepEngine(page, 12);
    const j = await info(page);
    await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
    expect(j.activeRunning, 'locomotion clip is running').toBe(true);
    expect(j.activeTime, 'locomotion clip advances, not frozen at frame 0').toBeGreaterThan(t0 + 0.05);
    await stand(page);
    expect((await info(page)).activeClip).toBe('Idle');

    // ── robot: legacy substring heuristics (Walking→walk) ────────────────────
    await page.getByTestId('avatar-picker-toggle').click();
    await page.getByTestId('avatar-option-34').click();
    await waitAvatar(page, '34', 'Walking');

    i = await info(page);
    expect(i.clips).toEqual(expect.arrayContaining(['Idle', 'Walking', 'Running', 'Jump']));
    expect(i.height).toBeGreaterThan(1.5);
    expect(i.height).toBeLessThan(2.1);
    expect(i.footOffset).not.toBeNull();
    expect(Math.abs(i.footOffset)).toBeLessThan(2);
    expect(i.activeClip).toBe('Idle');

    i = await walkToMotion(page);
    expect(i.state).toMatch(/walk|run/);
    expect(i.activeClip, 'heuristic mapped Walking/Running onto the state').toMatch(/Walking|Running/);
    await stand(page);
    expect((await info(page)).activeClip).toBe('Idle');

    await page.screenshot({ path: 'e2e/__screenshots__/avatar-robot.png' });

    // ── the pick persists across reload (DraftStore meta) ────────────────────
    await page.reload();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 60);
    await waitAvatar(page, '34', 'Walking');
    expect((await info(page)).resource, 'avatar pick survived reload').toBe('34');

    // eslint-disable-next-line no-console
    console.log('AVATAR-SELECT', JSON.stringify(await info(page)));
});
