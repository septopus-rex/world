import type { IGameApi } from '@engine/core/services/IGameApi';
import { HttpChannel } from '../net/HttpChannel';

/**
 * FetchGameApi — the REAL networked transport for a Game Setting's external API.
 * It dials the server declared by the Game Setting `baseurl` (game.md §2/§3):
 * each whitelisted method becomes `POST {baseUrl}/{method}` carrying the game
 * name, the session's gameId, and the params. The game state lives on the
 * server; this is a thin client.
 *
 * The engine never reaches this without first passing GameRuntime's `methods`
 * whitelist, so a non-whitelisted method never becomes a network request.
 *
 * Server response contract:
 *   start → { gameId, state }   (gameId opens the session; remembered here)
 *   *     → { state }           (operate on the open session)
 *   end   → { state, result }
 */
export class FetchGameApi implements IGameApi {
    private gameId: string | null = null;
    private readonly channel: HttpChannel;

    constructor(channel: HttpChannel | string) {
        // Accepts a hub channel or a bare data-declared baseurl (Game Setting).
        this.channel = typeof channel === 'string' ? new HttpChannel(channel) : channel;
    }

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        let data: any;
        try {
            data = await this.channel.postJson(`/${method}`, { game, gameId: this.gameId, params });
        } catch (e: any) {
            throw new Error(`[FetchGameApi] ${game}.${method} → ${e?.message ?? e}`);
        }
        if (method === 'start' && data?.gameId) this.gameId = data.gameId; // open session
        if (method === 'end') this.gameId = null;                          // close session
        return data?.state ?? data;
    }
}
