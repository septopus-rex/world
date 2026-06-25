import type { IGameApi } from '@engine/core/services/IGameApi';

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

    constructor(private readonly baseUrl: string) {}

    async call(game: string, method: string, params: any[] = []): Promise<any> {
        const res = await fetch(`${this.baseUrl}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ game, gameId: this.gameId, params }),
        });
        if (!res.ok) {
            throw new Error(`[FetchGameApi] ${game}.${method} → server ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (method === 'start' && data?.gameId) this.gameId = data.gameId; // open session
        if (method === 'end') this.gameId = null;                          // close session
        return data?.state ?? data;
    }
}
