import type { IGameApi } from '@engine/core/services/IGameApi';

/**
 * GameApiRouter — one IGameApi injected into the engine that dispatches each call
 * to the right per-game backend by the `game` name. This is what lets the engine
 * stay game-agnostic (it always calls world.gameApi.call(game, …)) while the host
 * serves many games. Backends can be loopback mocks or networked FetchGameApi —
 * the router doesn't care.
 */
export class GameApiRouter implements IGameApi {
    constructor(private readonly backends: Record<string, IGameApi>) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        const backend = this.backends[game];
        if (!backend) throw new Error(`[GameApiRouter] no transport registered for game "${game}"`);
        return backend.call(game, method, params);
    }
}
