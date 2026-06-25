/**
 * IGameApi — injectable transport for a Game Setting's external API (protocol
 * game.md §3). The engine NEVER performs the network/DOM call itself (core stays
 * host-agnostic, like IActuator / IChainPublisher); it hands a whitelisted method
 * call to whatever the host injected:
 *   - desktop PWA → talks to the game's external server (or an in-page mock)
 *   - chain build → could route over a verifiable transport
 *   - tests       → a fake that records calls
 *
 * The *whitelist* enforcement is the engine's job (GameRuntime, from
 * GameSetting.methods). The transport's job is only to perform an already-allowed
 * call and return its result. Calls are async — an external server round-trips.
 */
export interface IGameApi {
    /**
     * Perform an external game-API call. `method` has already passed the
     * GameSetting.methods whitelist when reached via GameRuntime.call.
     * Resolves with the method's response (shape per GameSetting.methods[].response).
     */
    call(game: string, method: string, params?: any[]): Promise<any>;
}

/** No-op transport: a World with no game API injected never crashes on a call. */
export class NullGameApi implements IGameApi {
    async call(_game: string, _method: string, _params?: any[]): Promise<any> {
        return null;
    }
}
