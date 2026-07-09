import type { IGameApi } from '@engine/core/services/IGameApi';

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
    private static probes = new Map<string, Promise<boolean>>();
    private backend: IGameApi | null = null;

    constructor(
        private readonly healthUrl: string,
        private readonly makeServer: () => IGameApi,
        private readonly makeLoopback: () => IGameApi,
    ) {}

    private static probe(url: string): Promise<boolean> {
        let p = this.probes.get(url);
        if (!p) {
            p = fetch(url, { signal: AbortSignal.timeout(800) })
                .then(async (r) => r.ok && (await r.json())?.ok === true)
                .catch(() => false);
            this.probes.set(url, p);
        }
        return p;
    }

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        if (!this.backend) {
            const online = await ProbedGameApi.probe(this.healthUrl);
            this.backend = online ? this.makeServer() : this.makeLoopback();
            console.log(`[games] ${game} transport: ${online ? 'game server (HTTP)' : 'in-page loopback'}`);
        }
        return this.backend.call(game, method, params);
    }
}
