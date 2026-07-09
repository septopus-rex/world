import type { IGameApi } from '@engine/core/services/IGameApi';
import type { HttpChannel } from '../net/HttpChannel';

/**
 * ProbedGameApi — offline-first transport picker for Pattern-A games, same
 * tiering philosophy as the IPFS stack: if the dev game server (services/game,
 * 7787) answers a quiet health probe, calls go over REAL HTTP (FetchGameApi
 * wire contract, session state held server-side); otherwise the in-page
 * loopback engine runs the game, byte-identically (it IS the same class the
 * server hosts).
 *
 * The probe is lazy (first gameApi call — user-triggered, milliseconds budget)
 * so the loader's constructor stays synchronous, and cached per base URL so a
 * world full of games probes once.
 */
export class ProbedGameApi implements IGameApi {
    private backend: IGameApi | null = null;

    constructor(
        private readonly channel: HttpChannel,        // the hub's game-service channel (probe cached there)
        private readonly makeServer: () => IGameApi,
        private readonly makeLoopback: () => IGameApi,
    ) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        if (!this.backend) {
            const online = await this.channel.probe();
            this.backend = online ? this.makeServer() : this.makeLoopback();
            (globalThis as any).__SEPTOPUS_GAME_TRANSPORT__ = online ? 'http' : 'loopback'; // debug/e2e surface
            console.log(`[games] ${game} transport: ${online ? 'game server (HTTP)' : 'in-page loopback'}`);
        }
        return this.backend.call(game, method, params);
    }
}
