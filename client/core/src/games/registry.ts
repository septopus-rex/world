import type { GameSetting } from '@engine/core/types/GameSetting';
import type { IGameApi } from '@engine/core/services/IGameApi';
import { MahjongGameApi } from './mahjong/MahjongGameApi';
import { PoolGameApi } from './pool/PoolGameApi';
import { HoldemGameApi } from './holdem/HoldemGameApi';
// Game Settings are DATA documents (game.md §2: on-chain/IPFS resources),
// frozen as *.game.json — the registry only binds id ↔ document ↔ transport.
import mahjongSetting from './mahjong/setting.game.json';
import poolSetting from './pool/setting.game.json';
import holdemSetting from './holdem/setting.game.json';

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
    /** Dev port of this game's OWN physical server (services/<name> — one game
     *  per server, the production operator model). */
    devPort: number;
}

export const GAMES: GameDef[] = [
    { name: 'mahjong', id: 42, setting: mahjongSetting as unknown as GameSetting, makeLoopback: () => new MahjongGameApi(), devPort: 7787 },
    { name: 'pool', id: 43, setting: poolSetting as unknown as GameSetting, makeLoopback: () => new PoolGameApi(), devPort: 7785 },
    { name: 'holdem', id: 44, setting: holdemSetting as unknown as GameSetting, makeLoopback: () => new HoldemGameApi(), devPort: 7784 },
];

export const gameById = (id: number): GameDef | undefined => GAMES.find(g => g.id === id);
export const gameByName = (name: string): GameDef | undefined => GAMES.find(g => g.name === name);
