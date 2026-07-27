/**
 * Non-positional player-state defaults.
 *
 * Position (block / position / rotation) is deliberately NOT here: the spawn
 * comes from the active level's `start` (WorldContent.playerState), which comes
 * from the level + world documents — and a persisted location overrides that at
 * hydrate. The `[2048, 2048]` that used to sit in this file was both DEAD (the
 * single consumer overwrote all three fields on the very next line) and a
 * hardcoded assumption that every world is a 4096² grid, which is now per-world
 * data (world.md §1 / core/utils/WorldMetrics).
 */
export const DEFAULT_PLAYER_STATE = {
    world: 'main',
    stop: { on: false, adjunct: "", index: 0 },
    extend: 2, // 5x5 streaming window
    posture: 0
};

export const STORAGE_KEYS = {
    PLAYER_STATE: "spp_player_state"
};
