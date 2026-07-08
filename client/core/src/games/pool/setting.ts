import type { GameSetting } from '@engine/core/types/GameSetting';

/**
 * Game Setting for the in-world pool table (game.md §2). Same contract as mahjong,
 * different game — the whole point of having two: the engine + host treat them
 * uniformly through the methods whitelist.
 */
export const POOL_GAME_ID = 43; // resource id carried by the playable block's `game` field

export const POOL_SETTING: GameSetting = {
    game: 'pool',
    baseurl: '/api/pool',
    homepage: '',
    version: '1.0.0',
    blocks: [],
    init: { server: { maxPlayers: 1 } },
    sync: null,
    wasm: null,
    methods: [
        { name: 'start', params: [], response: [{ type: 'string', length: 12 }] },
        { name: 'state', params: [], response: [{ type: 'string' }] },
        { name: 'shoot', params: [{ type: 'number', limit: [0, 360] }, { type: 'number', limit: [0, 100] }], response: [{ type: 'string' }] },
        { name: 'end', params: [], response: [{ type: 'string', length: 12 }] },
    ],
};
