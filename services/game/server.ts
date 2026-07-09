/**
 * Septopus dev GAME SERVER (7787) — Pattern-A external games as a REAL process.
 *
 * Until now the "external server" of the Game Mode Protocol was simulated two
 * ways: an in-page loopback mock (registry.makeLoopback) and a route-intercepted
 * fake inside mahjong-server.spec. This service is the missing third rung: the
 * SAME self-contained game engines (client/core/src/games/*) hosted out of
 * process, so dev genuinely exercises network transport, session state held
 * server-side, and the FetchGameApi wire contract (game.md §2/§3):
 *
 *   POST /api/{game}/start           → { gameId, state }   (opens a session)
 *   POST /api/{game}/{method}        → { state }           (operates on gameId)
 *   POST /api/{game}/end             → { state|result }    (closes the session)
 *   GET  /v0/health                  → { ok, service, games }
 *   GET  /v0/stats                   → { sessions, calls } (e2e proof the server ran it)
 *
 * The engine's methods-whitelist (GameRuntime) gates every call BEFORE it
 * becomes a request, exactly as with a production server. Swap the base URL
 * for a real deployment and nothing else changes.
 */
import http from 'node:http';
import { GAMES, gameByName } from '../../client/core/src/games/registry';
import type { IGameApi } from '../../engine/src/core/services/IGameApi';

const PORT = Number(process.env.PORT ?? 7787);

const sessions = new Map<string, IGameApi>();
let sessionSeq = 0;
let callCount = 0;

function send(res: http.ServerResponse, status: number, body: any): void {
    const bytes = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'content-length': bytes.length,
    });
    res.end(bytes);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    try {
        if (req.method === 'OPTIONS') return send(res, 204, {});
        if (req.method === 'GET' && url.pathname === '/v0/health') {
            return send(res, 200, { ok: true, service: 'game', games: GAMES.map(g => g.name) });
        }
        if (req.method === 'GET' && url.pathname === '/v0/stats') {
            return send(res, 200, { sessions: sessions.size, calls: callCount });
        }

        // POST /api/{game}/{method} — the FetchGameApi wire contract.
        const m = url.pathname.match(/^\/api\/([\w-]+)\/([\w-]+)$/);
        if (req.method === 'POST' && m) {
            const [, gameName, method] = m;
            const def = gameByName(gameName);
            if (!def) return send(res, 404, { error: `unknown game "${gameName}"` });
            const body = await readJson(req);
            callCount++;

            if (method === 'start') {
                // One session = one instance of the SAME engine the loopback runs.
                const api = def.makeLoopback();
                const state = await api.call(gameName, 'start', body.params ?? []);
                const gameId = `s${++sessionSeq}-${gameName}`;
                sessions.set(gameId, api);
                console.log(`[game] ${gameId} started`);
                return send(res, 200, { gameId, state });
            }
            const api = sessions.get(body.gameId ?? '');
            if (!api) return send(res, 404, { error: 'no such game session', gameId: body.gameId ?? null });
            const state = await api.call(gameName, method, body.params ?? []);
            if (method === 'end') {
                sessions.delete(body.gameId);
                console.log(`[game] ${body.gameId} ended`);
            }
            return send(res, 200, { state });
        }

        return send(res, 404, { error: 'not found' });
    } catch (e: any) {
        return send(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[game] Septopus dev game server → http://127.0.0.1:${PORT} (games: ${GAMES.map(g => g.name).join(', ')})`);
});
