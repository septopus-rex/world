import { SeptopusGlobalConstants } from './types/WorldConfig';

/**
 * Septopus PROTOCOL constants + engine defaults (base-data-audit D7 ruling):
 * · world.range/block/diff/max — protocol-wide invariants (world.md §1),
 *   shared by ALL worlds, NOT overridable per world.
 * · time.* — the DEFAULT calendar; a world doc's `time` section overrides it
 *   (EnvironmentSystem reads the injected config first). Single worlds own
 *   their calendar as DATA; this is only the fallback.
 */
export const GlobalConfig: SeptopusGlobalConstants = {
    world: {
        name: "Septopus World",
        desc: "A decentralized 3D spatial protocol.",
        range: [4096, 4096],
        block: [16, 16, 16], // [Width, Length, Height] in meters
        diff: 0.1,           // Height granularity
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
        speed: 1.0           // Normal time flow
    }
};

// Convenience shorthand
export const BLOCK_SIZE = GlobalConfig.world.block[0];
