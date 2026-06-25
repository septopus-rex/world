import type { IGameApi } from '@engine/core/services/IGameApi';
import { MahjongGame } from './MahjongGame';

/**
 * MahjongGameApi — the host's IGameApi transport for the mahjong game. The world
 * engine hands it whitelisted method calls (already gated by GameRuntime against
 * the Game Setting `methods`); this routes them to the standalone MahjongGame.
 *
 * In production this is where an HTTP/WebSocket client to a real mahjong server
 * would live. The mock runs the game in-page instead, but the seam is the same:
 * the engine never touches the game's internals, only this whitelisted surface.
 * A fresh game is created on `start`; subsequent calls operate on it.
 */
export class MahjongGameApi implements IGameApi {
    private game: MahjongGame | null = null;
    private seedCounter = 0;

    constructor(private readonly fixedSeed?: number) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        if (game !== 'mahjong') {
            throw new Error(`MahjongGameApi: unknown game "${game}"`);
        }
        switch (method) {
            case 'start': {
                const seed = this.fixedSeed ?? ((Date.now() & 0x7fffffff) ^ (this.seedCounter++ << 16));
                this.game = new MahjongGame(seed);
                return this.game.start();
            }
            case 'state':
                return this.requireGame().state();
            case 'discard':
                return this.requireGame().discard(Number(params[0]));
            case 'win':
                return this.requireGame().win();
            case 'end': {
                const result = this.requireGame().end();
                return result;
            }
            default:
                throw new Error(`MahjongGameApi: unsupported method "${method}"`);
        }
    }

    private requireGame(): MahjongGame {
        if (!this.game) throw new Error('MahjongGameApi: no active game (call start first)');
        return this.game;
    }
}
