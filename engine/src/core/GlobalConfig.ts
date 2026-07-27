import { SeptopusGlobalConstants } from './types/WorldConfig';

/**
 * Septopus PROTOCOL DEFAULTS — the values a world document inherits when it
 * declares none. NOT a place to read world parameters from.
 *
 * · world.range/block/diff — per-world geometry (world.md §1). A world document
 *   declares its own; these are the fallback. Engine code reads them ONLY via
 *   `world.metrics` (core/utils/WorldMetrics), which validates the document's
 *   values. Superseded base-data-audit D7's "invariant, not overridable per
 *   world" ruling (2026-07-27): the VALUES may be shared in practice, but the
 *   MECHANISM must be data — otherwise chain-served world configuration has no
 *   way to define a world's grid.
 * · world.max — METAVERSE-level (96 worlds on the cube's 6 faces); a property of
 *   the Septopus universe, not of any single world, so it stays here.
 * · time.* — the DEFAULT calendar; a world doc's `time` section overrides it
 *   (EnvironmentSystem reads the injected config first). Single worlds own
 *   their calendar as DATA; this is only the fallback.
 */
export const GlobalConfig: SeptopusGlobalConstants = {
    world: {
        name: "Septopus World",
        desc: "A decentralized 3D spatial protocol.",
        range: [4096, 4096],  // blocks per axis [East, North]
        block: [16, 16, 16],  // metres, Septopus order [East, North, Alt]
        diff: 0.1,            // height granularity, metres
        max: 96
    },
    time: {
        epoch: 0,            // Start block
        year: 2024,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        speed: 1.0,          // Normal time flow — CHAIN calendar (day/month/year) only
        // One full LOCAL sun cycle = 600 real seconds (10 min), chain-independent
        // (EnvironmentSystem §"sub-day time"): matches Bitcoin's own average
        // block spacing so a day/night cycle roughly completes between blocks,
        // purely for a coherent FEEL — mechanically the two are decoupled.
        localDaySeconds: 600
    }
};

// NOTE: there is deliberately NO `export const BLOCK_SIZE` here. A module-level
// snapshot is evaluated at import time, so a world document could never
// influence it. Use `world.metrics.blockWidth` (or DEFAULT_METRICS in tooling
// that has no World).
