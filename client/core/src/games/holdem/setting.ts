import type { GameSetting } from '@engine/core/types/GameSetting';

/**
 * The Game Setting resource for the in-world Texas Hold'em table (Game Mode
 * Protocol, game.md §2) — the third Pattern-A game, exercising the multi-game
 * architecture: its own methods whitelist, its own baseurl, its OWN physical
 * dev server (services/holdem, 7784). Hidden information (opponents' hole
 * cards) is exactly why poker is Pattern A: server-authoritative by design
 * (game.md §9 — commit-reveal / server deals).
 */
export const HOLDEM_GAME_ID = 44; // resource id carried by the playable block's `game` field

export const HOLDEM_SETTING: GameSetting = {
    game: 'holdem',
    baseurl: '/api/holdem',
    homepage: '',
    version: '1.0.0',
    blocks: [],
    init: {
        server: { maxPlayers: 1 }, // human vs 3 bots in the mock
    },
    sync: null,
    wasm: null,
    methods: [
        { name: 'start', params: [], response: [{ type: 'string', length: 12 }] },
        { name: 'state', params: [], response: [{ type: 'string' }] },
        { name: 'act', params: [{ type: 'string', limit: [0, 8] }], response: [{ type: 'string' }] },
        { name: 'end', params: [], response: [{ type: 'string', length: 12 }] },
    ],
};
