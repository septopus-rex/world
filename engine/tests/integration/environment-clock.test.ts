import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';

// Time + weather are derived from block height + hash (EnvironmentSystem). The
// machinery was fully built but DEAD — onNewBlock had zero callers, so time froze
// at 12:00 and weather at 'clear'. Engine.feedChainState is the wire that brings
// it alive. These tests drive that wire headlessly (NullRenderEngine stubs the
// light/particle calls, so update() runs without a GPU).
//
// Split (2026-07-13, protocol/{cn,en}/world.md §3.1/§3.2): the CHAIN calendar
// (year/month/day + weather) is derived from height/hash, feedChainState-only,
// semantic/cross-engine-identical. Hour/minute/second are a separate LOCAL
// simulation (advances every update() tick, chain-independent) so the sun
// still visibly rises and sets between blocks — see the last describe block.

const envState = (engine: any) => {
    const world = engine.getWorld()!;
    const id = world.getEntitiesWith(['EnvironmentStateComponent'])[0];
    return world.getComponent<any>(id, 'EnvironmentStateComponent');
};

// hash whose weather slices (chars 12–15) select a category. cat '02' → index 2 → rain.
const hashFor = (catHex: string) => '0x' + 'a'.repeat(10) + catHex + '02' + 'a'.repeat(48);

describe('environment clock — feedChainState wire (chain calendar + weather)', () => {
    it('starts frozen at the initial state until fed', async () => {
        const engine = await makeHeadlessEngine();
        const s = envState(engine);
        expect(s.hour).toBe(12);
        expect(s.weatherCategory).toBe('clear');
    });

    it('advances the chain calendar + weather from height/hash', async () => {
        const engine = await makeHeadlessEngine();
        // interval 3600 (1 height = 1 chain-hour), height 30 → 108000s elapsed
        // = 1 day + 6 hours → day rolls to 1; hash → rain. Hour/minute are NOT
        // chain-derived (see the local-clock describe block below).
        engine.feedChainState(30, hashFor('02'), 3600);
        const s = envState(engine);
        expect(s.day).toBe(1);
        expect(s.weatherCategory).toBe('rain');
        // The per-frame light/particle update runs headlessly without throwing.
        expect(() => engine.step(1 / 60)).not.toThrow();
    });

    it('resets lower units at a day boundary (no frozen-clock port bug)', async () => {
        const engine = await makeHeadlessEngine();
        // diff = 60 * 1440 = 86400 = exactly one day → day rolls to 1.
        engine.feedChainState(60, hashFor('00'), 1440);
        const s = envState(engine);
        expect(s.day).toBe(1);
        expect(s.month).toBe(0);   // would be STALE under the old gated assignment
        expect(s.weatherCategory).toBe('clear'); // cat '00' → index 0
    });

    it('is a no-op when the same height is fed twice', async () => {
        const engine = await makeHeadlessEngine();
        engine.feedChainState(5, hashFor('06'), 3600); // cat 6 % 4 = 2 → rain
        const d1 = envState(engine).day;
        engine.feedChainState(5, hashFor('00'), 3600); // same height → ignored
        const s = envState(engine);
        expect(s.day).toBe(d1);
        expect(s.weatherCategory).toBe('rain'); // unchanged (second feed ignored)
    });

    // 1 Bitcoin block = 1 Septopus day (protocol/{cn,en}/world.md §3.1/§3.2,
    // client/core/src/lib/loader/BtcClock.ts). Mechanically this is just
    // interval=86400 at the engine's default speed=1.0 — GlobalConfig itself
    // is untouched by the real-clock feature, so this pins that the DEFAULT
    // config really does produce exactly one calendar day per block.
    it('1 个比特币区块 = 1 个 Septopus 日(默认 speed,interval=86400)', async () => {
        const engine = await makeHeadlessEngine();
        engine.feedChainState(1, hashFor('00'), 86400);
        expect(envState(engine).day).toBe(1);

        // Ten blocks → exactly ten days — confirms the mapping holds cleanly
        // across multiple blocks, not just one.
        engine.feedChainState(10, hashFor('00'), 86400);
        expect(envState(engine).day).toBe(10);
    });
});

describe('sub-day local clock — chain-INDEPENDENT (world.md §3.2)', () => {
    it('cycles hour/minute continuously via step() alone, with NO feedChainState call', async () => {
        const engine = await makeHeadlessEngine();
        // A fast 40-simulated-second local day makes a full cycle cheap to
        // step through. Must be set before the FIRST update()/step() call —
        // syncTimeFromConfig reads world.config.time exactly once, lazily.
        // Rate: 86400/40 = 2160 sim-seconds per real second. localSeconds
        // starts at noon (43200s), matching the component's initial hour:12.
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };

        stepN(engine, 10 * 60, 1 / 60); // 10 real s → +21600 sim-s → 18:00 (dusk)
        expect(envState(engine).hour).toBe(18);

        stepN(engine, 10 * 60, 1 / 60); // +10 real s more → +21600 → wraps to 00:00 (midnight)
        expect(envState(engine).hour).toBe(0);

        stepN(engine, 20 * 60, 1 / 60); // +20 real s more (one full 40s cycle done) → back to 12:00 (noon)
        const wrapped = envState(engine);
        expect(wrapped.hour).toBe(12);

        // No chain feed ever happened — the calendar stayed at its initial day.
        expect(wrapped.day).toBe(0);
        expect(wrapped.currentHeight).toBe(0);
    });

    it('a feedChainState call does NOT move the sun (day/weather only)', async () => {
        const engine = await makeHeadlessEngine();
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };
        stepN(engine, 5 * 60, 1 / 60); // settle partway into the local day
        const before = envState(engine).hour;

        engine.feedChainState(1, hashFor('02'), 86400); // 1 Bitcoin block = 1 day
        const after = envState(engine);
        expect(after.day).toBe(1);
        expect(after.weatherCategory).toBe('rain');
        expect(after.hour).toBe(before); // unaffected — hour is chain-independent
    });
});
