import type { IGameApi } from '@engine/core/services/IGameApi';
import { PoolGame } from './PoolGame';

/**
 * PoolGameApi — the host's loopback transport for pool (mirrors MahjongGameApi).
 * The engine hands it whitelisted calls (already gated by GameRuntime against
 * POOL_SETTING.methods); this routes them to the standalone PoolGame.
 */
export class PoolGameApi implements IGameApi {
    private game: PoolGame | null = null;
    private seedCounter = 0;

    constructor(private readonly fixedSeed?: number) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        if (game !== 'pool') throw new Error(`PoolGameApi: unknown game "${game}"`);
        switch (method) {
            case 'start': {
                const seed = this.fixedSeed ?? ((Date.now() & 0x7fffffff) ^ (this.seedCounter++ << 16));
                this.game = new PoolGame(seed);
                return this.game.start();
            }
            case 'state':
                return this.require().state();
            case 'shoot':
                return this.require().shoot(Number(params[0]), Number(params[1]));
            case 'end':
                return this.require().end();
            default:
                throw new Error(`PoolGameApi: unsupported method "${method}"`);
        }
    }

    private require(): PoolGame {
        if (!this.game) throw new Error('PoolGameApi: no active game (call start first)');
        return this.game;
    }
}
