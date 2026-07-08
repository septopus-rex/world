export const DEFAULT_PLAYER_STATE = {
    block: [2048, 2048] as [number, number],
    world: 'main',
    position: [8, 8, 1.0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    stop: { on: false, adjunct: "", index: 0 },
    extend: 2, // 5x5 grid
    posture: 0
};

export const STORAGE_KEYS = {
    PLAYER_STATE: "spp_player_state"
};
