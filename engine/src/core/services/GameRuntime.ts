import { GameSetting } from '../types/GameSetting';
import { IGameApi } from './IGameApi';

/**
 * GameRuntime — the live session for one playable zone's game. Holds the resolved
 * GameSetting + the injected transport, and is the SINGLE choke point through
 * which any external API call must pass.
 *
 * It enforces the protocol's whitelist (game.md §3): "游戏模式下，如提供了
 * `methods`，引擎仅允许与其中定义的外部 API 进行通讯". A call to a method that is
 * not on GameSetting.methods is refused here — the transport is never reached.
 * If a game declares no `methods` at all, it has NO external API (pure-P2P per the
 * §3 note), so every external call is refused.
 *
 * Created when the player enters Game mode on a zone that resolved a GameSetting;
 * disposed when they leave. The HUD, actuator, or any caller drives moves through
 * `world.gameRuntime.call(method, params)` — they cannot bypass the whitelist.
 */
export class GameRuntime {
    /** Opaque session token returned by `start` (e.g. a server game id). */
    public session: any = null;
    /** True between a resolved `start` and `end`. */
    public started = false;

    constructor(
        public readonly setting: GameSetting,
        private readonly api: IGameApi,
    ) {}

    public get game(): string { return this.setting.game; }

    /** Is `method` on this game's external-API whitelist? */
    public allows(method: string): boolean {
        const m = this.setting.methods;
        if (!m || m.length === 0) return false;       // no methods ⇒ no external API
        return m.some(x => x.name === method);
    }

    /**
     * Call a whitelisted external method. Throws if `method` is not whitelisted —
     * the transport is never reached for a refused call. Resolves with the
     * method's response.
     */
    public async call(method: string, params: any[] = []): Promise<any> {
        if (!this.allows(method)) {
            throw new Error(
                `[GameRuntime] game "${this.setting.game}" refused method "${method}": not in the methods whitelist (game.md §3).`,
            );
        }
        return this.api.call(this.setting.game, method, params);
    }
}
