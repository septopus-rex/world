import type { IGameApi } from '@engine/core/services/IGameApi';
import { HoldemGame } from './HoldemGame';

/**
 * HoldemGameApi — the host's IGameApi transport for Texas Hold'em. Same seam as
 * MahjongGameApi/PoolGameApi: the engine hands it whitelisted calls (gated by
 * GameRuntime against the Game Setting `methods`); in production this surface
 * is a remote server (services/holdem hosts THIS class per session), in-page
 * it runs as the offline loopback — byte-identical play either way.
 */
export class HoldemGameApi implements IGameApi {
    private game: HoldemGame | null = null;
    private seedCounter = 0;

    constructor(private readonly fixedSeed?: number) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        if (game !== 'holdem') throw new Error(`HoldemGameApi: unknown game "${game}"`);
        switch (method) {
            case 'start': {
                const seed = this.fixedSeed ?? ((Date.now() & 0x7fffffff) ^ (this.seedCounter++ << 16));
                this.game = new HoldemGame(seed);
                return this.game.start();
            }
            case 'state':
                return this.requireGame().state();
            case 'act':
                return this.requireGame().act(String(params[0]) as any);
            case 'end':
                return this.requireGame().end();
            default:
                throw new Error(`HoldemGameApi: unsupported method "${method}"`);
        }
    }

    private requireGame(): HoldemGame {
        if (!this.game) throw new Error('HoldemGameApi: no active game (call start first)');
        return this.game;
    }
}
