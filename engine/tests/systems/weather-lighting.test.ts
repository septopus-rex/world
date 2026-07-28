import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

/**
 * Weather → light. Until 2026-07-28 the two were disconnected apart from the
 * lightning flash: a grade-3 downpour rendered under a full blue sky with hard
 * sun shadows, because sun/ambient/sky were driven by the time of day alone.
 *
 * The coupling is ONE scalar (EnvironmentSystem.OVERCAST) driving four targets.
 * Two of those pins are not tuning, they are contracts:
 *
 *   · `clear` MUST be an exact identity. The clear-day light ratio is a tuned
 *     set (画面基线: sun 1.9 / amb 0.05 / IBL 0.32) and the whole feature has to
 *     be inert in fair weather, or it becomes a second place that quietly
 *     re-grades every scene.
 *   · fog `far` MUST NOT move with weather. It is metrics.streamingReach — the
 *     radius the streaming window is guaranteed to fill — and the moment it
 *     drifts the window's own boundary is visible again (the "缺角" family of
 *     bugs, docs/architecture/performance.md). Weather may fog you IN; it may
 *     never fog you out past the loaded world.
 */

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function envState(world: any) {
    return world.getComponent(world.queryEntities('EnvironmentStateComponent')[0], 'EnvironmentStateComponent');
}

/** Settle the chased visuals under a given weather, then read what the renderer got. */
async function underWeather(category: string, grade: number) {
    const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    const state = envState(world);
    state.weatherCategory = category;
    state.weatherGrade = grade;
    // Long enough for the `chase` envelope (2.5/s) to converge; the local clock
    // barely moves in 4 s of a 2-minute day, so the day factor is ~constant.
    for (let i = 0; i < 240; i++) engine.step(1 / 60);
    const c = nullEngine.__counts;
    return {
        sun: c.lastSunIntensity as number,
        ambient: c.lastAmbient as number,
        overcast: c.lastOvercast as number,
        fogSetup: c.lastFog as { near: number; far: number },
        fogLive: c.lastFogRange as { near: number; far: number },
    };
}

describe('weather → light coupling', () => {
    it('clear weather is an EXACT identity — the tuned baseline is untouched', async () => {
        const clear = await underWeather('clear', 3);   // grade must not matter when clear
        expect(clear.overcast).toBe(0);
        // Daylight targets, reached: sun 1.9 / ambient 0.05 (EnvironmentSystem.DAYLIGHT).
        expect(clear.sun).toBeCloseTo(1.9, 2);
        expect(clear.ambient).toBeCloseTo(0.05, 3);
        // …and the haze is exactly where the streaming reach put it at construction.
        expect(clear.fogLive.near).toBeCloseTo(clear.fogSetup.near, 5);
        expect(clear.fogLive.far).toBe(clear.fogSetup.far);
    });

    it('a downpour kills the sun, lifts the fill, and thickens the haze', async () => {
        const clear = await underWeather('clear', 0);
        const storm = await underWeather('rain', 3);

        expect(storm.overcast).toBeGreaterThan(0.85);
        // The direct beam nearly goes — this is also what makes the hard sun
        // shadows fade out, with no shadow-specific code.
        expect(storm.sun).toBeLessThan(clear.sun * 0.2);
        // …while the omnidirectional fill RISES: overcast light is flat, not just dim.
        expect(storm.ambient).toBeGreaterThan(clear.ambient);
        // Net must still be darker overall, or "storm" just looks like a grey noon.
        expect(storm.sun + storm.ambient).toBeLessThan((clear.sun + clear.ambient) * 0.5);
        // Visibility drops.
        expect(storm.fogLive.near).toBeLessThan(clear.fogLive.near);
    });

    it('fog FAR never moves with weather — the streaming boundary stays hidden', async () => {
        const results = await Promise.all([
            underWeather('clear', 0), underWeather('cloud', 3),
            underWeather('rain', 3), underWeather('snow', 3),
        ]);
        const fars = new Set(results.map((r) => r.fogLive.far));
        expect(fars.size, 'weather moved the fog far plane').toBe(1);
        expect([...fars][0]).toBe(results[0].fogSetup.far);
    });

    it('grade scales it, and every precipitating category dims', async () => {
        const drizzle = await underWeather('rain', 0);
        const downpour = await underWeather('rain', 3);
        expect(downpour.overcast).toBeGreaterThan(drizzle.overcast);
        expect(downpour.sun).toBeLessThan(drizzle.sun);

        // 'cloud' used to do nothing at all either — an overcast sky that lit the
        // scene exactly like a clear one.
        const cloud = await underWeather('cloud', 2);
        const clear = await underWeather('clear', 0);
        expect(cloud.overcast).toBeGreaterThan(0);
        expect(cloud.sun).toBeLessThan(clear.sun);

        const snow = await underWeather('snow', 2);
        expect(snow.sun).toBeLessThan(clear.sun);
        // Snow is brighter than an equally graded rainstorm (thinner cloud + albedo).
        expect(snow.sun).toBeGreaterThan((await underWeather('rain', 2)).sun);
    });

    it('an unknown category falls back to clear instead of guessing', async () => {
        const weird = await underWeather('ash-fall', 3);
        expect(weird.overcast).toBe(0);
        expect(weird.sun).toBeCloseTo(1.9, 2);
    });

    it('weather changes GLIDE — a block tick must not snap the exposure', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        const state = envState(world);
        for (let i = 0; i < 120; i++) engine.step(1 / 60);
        const before = nullEngine.__counts.lastSunIntensity as number;

        // Weather is re-derived on a new block: a step change in the input.
        state.weatherCategory = 'rain';
        state.weatherGrade = 3;
        engine.step(1 / 60);
        const oneFrameLater = nullEngine.__counts.lastSunIntensity as number;

        // One frame may only nibble at the gap, never cross it.
        expect(oneFrameLater).toBeLessThan(before);
        expect(before - oneFrameLater).toBeLessThan((before - 0.15) * 0.25);
    });
});
