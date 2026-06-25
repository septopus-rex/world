import type { GameSetting } from '@engine/core/types/GameSetting';

/**
 * The Game Setting resource for the in-world mahjong table (Septopus Game Mode
 * Protocol, game.md §2). In a real deployment this JSON lives as a resource on
 * chain/IPFS and the block's `game` field is its resource id; here the desktop
 * DataSource serves it directly (DesktopLoader.gameSetting).
 *
 * The `methods` list is the external-API whitelist (§3): the engine will ONLY let
 * the runtime call these. `baseurl` is where a real server would live — our mock
 * runs in-page, but the contract is identical, which is the whole point: the
 * world hosts the 3D scene + entry, the game is an external API.
 */
export const MAHJONG_GAME_ID = 42; // resource id carried by the playable block's `game` field

export const MAHJONG_SETTING: GameSetting = {
    game: 'mahjong',
    baseurl: 'https://mahjong.mock.septopus.local',
    homepage: '',
    version: '1.0.0',
    // Single playable block (the table sits on it). Absolute coords filled at
    // placement time by the loader; the engine preloads the neighbourhood anyway.
    blocks: [],
    init: {
        // Single-player vs 3 bots — no multiplayer server needed for the mock.
        server: { maxPlayers: 1 },
    },
    sync: null, // single-player; P2P/sync deferred (game.md §7)
    wasm: null,
    methods: [
        { name: 'start', params: [], response: [{ type: 'string', length: 12 }] },
        { name: 'state', params: [], response: [{ type: 'string' }] },
        { name: 'discard', params: [{ type: 'number', limit: [0, 26] }], response: [{ type: 'string' }] },
        { name: 'win', params: [], response: [{ type: 'string' }] },
        { name: 'end', params: [], response: [{ type: 'string', length: 12 }] },
    ],
};
