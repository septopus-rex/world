import { SeptopusGlobalConstants } from './types/WorldConfig';

/**
 * Global Septopus Protocol Constants.
 * These are "On-Chain" shared values across all 96 worlds.
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
