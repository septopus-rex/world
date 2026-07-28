import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

/**
 * Player-attached lights (render/PlayerLighting): the avatar fill and the hand
 * torch. Reported by the report "天黑了之后现在就太黑了" — the night baseline
 * (sun 0.15 / ambient 0.02) is a real night, and a real night with nothing to
 * see by means you cannot find your own avatar.
 *
 * The pins here are the ones that would silently rot:
 *   · the fill is driven by 1 − dayF, so it must be EXACTLY 0 at noon. Anything
 *     else means the tuned daylight baseline (画面基线) now has a second light
 *     added to it that nobody remembers adding.
 *   · it must FOLLOW the player. A light anchored once looks right in the spot
 *     it was tested and nowhere else.
 *   · the torch is view state: toggling it must not need a world, an entity or
 *     a component, and the engine — not the UI — is the source of truth.
 */

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

/** Force the local sun clock to an hour of the day, then settle a few frames. */
async function atHour(hour: number, steps = 30) {
    const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    const env: any = world.systems.findSystemByName('EnvironmentSystem');
    env.localSeconds = hour * 3600;
    for (let i = 0; i < steps; i++) engine.step(1 / 60);
    return { engine, world, nullEngine, light: () => nullEngine.__counts.lastPlayerLight };
}

describe('player lighting — avatar fill', () => {
    it('is EXACTLY off at noon — the daylight baseline gains nothing', async () => {
        const { light } = await atHour(12);
        expect(light(), 'the fill was never anchored at all').not.toBeNull();
        expect(light()!.night).toBe(0);
    });

    it('comes up at night', async () => {
        const noon = await atHour(12);
        const midnight = await atHour(0);
        expect(midnight.light()!.night).toBeGreaterThan(0.9);
        expect(midnight.light()!.night).toBeGreaterThan(noon.light()!.night);
    });

    it('crosses dusk gradually, not as a switch', async () => {
        // 18:00 is inside the twilight band (EnvironmentSystem.DAYLIGHT.twilight),
        // so the fill must be part-way up — the same smoothstep the sun sets on.
        const dusk = (await atHour(18)).light()!.night;
        expect(dusk).toBeGreaterThan(0);
        expect(dusk).toBeLessThan(1);
    });

    it('follows the player rather than staying where it was first anchored', async () => {
        const { engine, world, light } = await atHour(0);
        const before = light()!.pos;

        const pid = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const t: any = world.getComponent(pid, 'TransformComponent');
        t.position[0] += 25;
        t.position[2] -= 40;
        engine.step(1 / 60);

        const after = light()!.pos;
        expect(after[0]).toBeCloseTo(before[0] + 25, 3);
        expect(after[2]).toBeCloseTo(before[2] - 40, 3);
    });

    it('an overcast day is dim enough to count, but is not night', async () => {
        const clear = await atHour(12);
        const storm = await atHour(12);
        const state: any = storm.world.getComponent(
            storm.world.queryEntities('EnvironmentStateComponent')[0], 'EnvironmentStateComponent');
        state.weatherCategory = 'rain';
        state.weatherGrade = 3;
        for (let i = 0; i < 240; i++) storm.engine.step(1 / 60);

        expect(storm.light()!.night).toBeGreaterThan(clear.light()!.night);
        expect(storm.light()!.night, 'a storm at noon is dim, not nocturnal').toBeLessThan(0.5);
    });
});

describe('player lighting — hand torch', () => {
    it('toggles through the engine, which owns the state', async () => {
        const { engine, nullEngine } = await atHour(0);
        expect(engine.isFlashlightOn()).toBe(false);

        expect(engine.toggleFlashlight()).toBe(true);
        expect(engine.isFlashlightOn()).toBe(true);
        expect(nullEngine.__counts.flashlight, 'the renderer was actually told').toBe(true);

        expect(engine.toggleFlashlight()).toBe(false);
        expect(nullEngine.__counts.flashlight).toBe(false);
    });

    it('is independent of the night factor — usable indoors at noon', async () => {
        const { engine, nullEngine, light } = await atHour(12);
        engine.setFlashlight(true);
        engine.step(1 / 60);
        expect(nullEngine.__counts.flashlight).toBe(true);
        expect(light()!.night, 'daylight still reports no darkness').toBe(0);
    });
});
