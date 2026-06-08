import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine } from '../helpers/make-world';

// Time + weather are derived from block height + hash (EnvironmentSystem). The
// machinery was fully built but DEAD — onNewBlock had zero callers, so time froze
// at 12:00 and weather at 'clear'. Engine.feedChainState is the wire that brings
// it alive. These tests drive that wire headlessly (NullRenderEngine stubs the
// light/particle calls, so update() runs without a GPU).

const envState = (engine: any) => {
    const world = engine.getWorld()!;
    const id = world.getEntitiesWith(['EnvironmentStateComponent'])[0];
    return world.getComponent<any>(id, 'EnvironmentStateComponent');
};

// hash whose weather slices (chars 12–15) select a category. cat '02' → index 2 → rain.
const hashFor = (catHex: string) => '0x' + 'a'.repeat(10) + catHex + '02' + 'a'.repeat(48);

describe('environment clock — feedChainState wire', () => {
    it('starts frozen at the initial state until fed', async () => {
        const engine = await makeHeadlessEngine();
        const s = envState(engine);
        expect(s.hour).toBe(12);
        expect(s.weatherCategory).toBe('clear');
    });

    it('advances time + weather from height/hash', async () => {
        const engine = await makeHeadlessEngine();
        // interval 3600 (1 height = 1 game-hour), height 10 → 10:00; hash → rain.
        engine.feedChainState(10, hashFor('02'), 3600);
        const s = envState(engine);
        expect(s.hour).toBe(10);
        expect(s.weatherCategory).toBe('rain');
        // The per-frame light/particle update runs headlessly without throwing.
        expect(() => engine.step(1 / 60)).not.toThrow();
    });

    it('resets lower units at a day boundary (no frozen-clock port bug)', async () => {
        const engine = await makeHeadlessEngine();
        // diff = 60 * 1440 = 86400 = exactly one day → day rolls to 1, hour/minute → 0.
        engine.feedChainState(60, hashFor('00'), 1440);
        const s = envState(engine);
        expect(s.day).toBe(1);
        expect(s.hour).toBe(0);     // would be STALE (23) under the old gated assignment
        expect(s.minute).toBe(0);
        expect(s.weatherCategory).toBe('clear'); // cat '00' → index 0
    });

    it('is a no-op when the same height is fed twice', async () => {
        const engine = await makeHeadlessEngine();
        engine.feedChainState(5, hashFor('06'), 3600); // cat 6 % 4 = 2 → rain
        const h1 = envState(engine).hour;
        engine.feedChainState(5, hashFor('00'), 3600); // same height → ignored
        const s = envState(engine);
        expect(s.hour).toBe(h1);
        expect(s.weatherCategory).toBe('rain'); // unchanged (second feed ignored)
    });
});
