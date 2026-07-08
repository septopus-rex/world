import type { GameSetting } from '@engine/core/types/GameSetting';
import type { IGameApi } from '@engine/core/services/IGameApi';
import { MAHJONG_GAME_ID, MAHJONG_SETTING } from './mahjong/setting';
import { MahjongGameApi } from './mahjong/MahjongGameApi';
import { POOL_GAME_ID, POOL_SETTING } from './pool/setting';
import { PoolGameApi } from './pool/PoolGameApi';

/**
 * Game registry — the single list of in-world games. Each entry ties a Game
 * Setting resource id (carried in a block's `game` field) to its setting and its
 * in-page loopback transport. The loader resolves settings by id and builds the
 * API router from this list; adding a game = one entry here (+ its scene + HUD).
 *
 * The engine is game-agnostic (it routes by the `game` name in GameSetting), so
 * everything game-specific lives behind this table on the client.
 */
export interface GameDef {
    /** Game name — must match GameSetting.game (the router dispatches on it). */
    name: string;
    /** Resource id placed in a block's `game` field (raw[4]) to mark its zone. */
    id: number;
    setting: GameSetting;
    /** Build the in-page loopback transport (offline / no server). */
    makeLoopback(): IGameApi;
}

export const GAMES: GameDef[] = [
    { name: 'mahjong', id: MAHJONG_GAME_ID, setting: MAHJONG_SETTING, makeLoopback: () => new MahjongGameApi() },
    { name: 'pool', id: POOL_GAME_ID, setting: POOL_SETTING, makeLoopback: () => new PoolGameApi() },
];

export const gameById = (id: number): GameDef | undefined => GAMES.find(g => g.id === id);
export const gameByName = (name: string): GameDef | undefined => GAMES.find(g => g.name === name);
