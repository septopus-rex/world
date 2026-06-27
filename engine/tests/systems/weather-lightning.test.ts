import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { EnvironmentSystem } from '../../src/core/systems/EnvironmentSystem';

// Lightning: thunderstorms (rain + grade≥1) pop a flash envelope that brightens
// the whole scene (ambient + sun) and decays. The old engine only ever stubbed
// this (effects/scene/lightning.js was an empty function). Deterministic timer,
// no RNG, so stepping reproduces the same storm.

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

/** Step n frames, returning the peak lightning level + peak ambient seen. */
function stormPeaks(engine: any, world: any, nullEngine: any, frames: number) {
    let maxFlash = 0, maxAmbient = 0;
    for (let i = 0; i < frames; i++) {
        engine.step(1 / 60);
        maxFlash = Math.max(maxFlash, envState(world).lightning ?? 0);
        maxAmbient = Math.max(maxAmbient, nullEngine.__counts.lastAmbient ?? 0);
    }
    return { maxFlash, maxAmbient };
}

describe('weather lightning', () => {
    // Lighting (incl. the lightning flash) is temporarily parked flat — see
    // EnvironmentSystem.FLAT_LIGHTING. While parked, no flash is applied, so this
    // strike assertion is skipped; flipping the flag back re-enables it.
    it.skipIf(EnvironmentSystem.FLAT_LIGHTING)('a thunderstorm strikes — flash pops the ambient + sun', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        const state = envState(world);
        state.weatherCategory = 'rain';
        state.weatherGrade = 2; // strike every 8/2 = 4s

        // 6s (360 frames) covers at least one strike.
        const { maxFlash, maxAmbient } = stormPeaks(engine, world, nullEngine, 360);
        expect(maxFlash).toBeGreaterThan(0.9);          // a strike reached near-full
        expect(maxAmbient).toBeGreaterThan(0.4 + 1.0);  // base 0.4 + flash boost
    });

    it.skipIf(EnvironmentSystem.FLAT_LIGHTING)('the flash decays back to dark between strikes', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        const state = envState(world);
        state.weatherCategory = 'rain';
        state.weatherGrade = 1; // strike every 8s

        // Step to just after the first strike, then 0.5s more (> 0.35s decay).
        stormPeaks(engine, world, nullEngine, 8 * 60 + 2);
        stormPeaks(engine, world, nullEngine, 30);
        expect(envState(world).lightning).toBe(0);
    });

    it('clear weather never strikes', async () => {
        const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        const state = envState(world);
        state.weatherCategory = 'clear';
        state.weatherGrade = 3;

        const { maxFlash } = stormPeaks(engine, world, nullEngine, 600); // 10s, nothing
        expect(maxFlash).toBe(0);
    });
});
