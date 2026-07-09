/**
 * game-host — the shared HTTP host for ONE external game server (Game Mode
 * Protocol, game.md §2/§3). Each game runs as its OWN physical service (its
 * own process/port/package — production reality: different games, different
 * operators), and a per-game server is just:
 *
 *     serveGame({ name: 'mahjong', port: 7787, makeApi: () => new MahjongGameApi() })
 *
 * Wire contract = exactly what FetchGameApi dials:
 *   POST /api/{name}/start          → { gameId, state }   (opens a session)
 *   POST /api/{name}/{method}       → { state }           (operates on gameId)
 *   POST /api/{name}/end            → { state }           (closes the session)
 *   GET  /v0/health                 → { ok, service, game }
 *   GET  /v0/stats                  → { sessions, calls }  (e2e proof)
 *
 * TWO CHANNELS on the SAME port (the transport split): HTTP above is the
 * request/response half (client-initiated session calls); a WebSocket upgrade
 * on `/live` is the PUSH half — the server broadcasts session events
 * ({topic:'game', data:{event,gameId,…}}) to subscribers, the wire shape
 * WebSocketLiveSource already speaks ({op:'subscribe'|'unsubscribe'|'ping'}
 * inbound, {topic,data,ts} outbound). Spectating/multiplayer rides this later;
 * today it makes the dev stack's push channel REAL instead of the in-page
 * FakeWebSocket.
 *
 * The engine's methods-whitelist (GameRuntime) gates every call BEFORE it
 * becomes a request; a session hosts the same self-contained game engine the
 * in-page loopback runs, so play is byte-identical — only the transport and
 * the state's address change.
 */
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export interface GameApiLike {
    call(game: string, method: string, params?: any[]): Promise<any>;
}

export interface GameHostConfig {
    name: string;                 // the ONE game this server hosts
    port: number;
    makeApi: () => GameApiLike;   // one instance per session
}

export function serveGame({ name, port, makeApi }: GameHostConfig): http.Server {
    const sessions = new Map<string, GameApiLike>();
    let sessionSeq = 0;
    let callCount = 0;

    const send = (res: http.ServerResponse, status: number, body: any): void => {
        const bytes = Buffer.from(JSON.stringify(body));
        res.writeHead(status, {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'content-type',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'content-length': bytes.length,
        });
        res.end(bytes);
    };

    const readJson = async (req: http.IncomingMessage): Promise<any> => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
    };

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        try {
            if (req.method === 'OPTIONS') return send(res, 204, {});
            if (req.method === 'GET' && url.pathname === '/v0/health') {
                return send(res, 200, { ok: true, service: 'game', game: name });
            }
            if (req.method === 'GET' && url.pathname === '/v0/stats') {
                return send(res, 200, { sessions: sessions.size, calls: callCount });
            }

            const m = url.pathname.match(/^\/api\/([\w-]+)\/([\w-]+)$/);
            if (req.method === 'POST' && m) {
                const [, gameName, method] = m;
                if (gameName !== name) return send(res, 404, { error: `this server hosts "${name}", not "${gameName}"` });
                const body = await readJson(req);
                callCount++;

                if (method === 'start') {
                    const api = makeApi();
                    const state = await api.call(name, 'start', body.params ?? []);
                    const gameId = `s${++sessionSeq}-${name}`;
                    sessions.set(gameId, api);
                    console.log(`[${name}] ${gameId} started`);
                    broadcast('game', { event: 'started', game: name, gameId });
                    return send(res, 200, { gameId, state });
                }
                const api = sessions.get(body.gameId ?? '');
                if (!api) return send(res, 404, { error: 'no such game session', gameId: body.gameId ?? null });
                const state = await api.call(name, method, body.params ?? []);
                if (method === 'end') {
                    sessions.delete(body.gameId);
                    console.log(`[${name}] ${body.gameId} ended`);
                    broadcast('game', { event: 'ended', game: name, gameId: body.gameId });
                } else {
                    broadcast('game', { event: 'move', game: name, gameId: body.gameId, method });
                    broadcast(`game/${body.gameId}`, { event: 'move', method, state });
                }
                return send(res, 200, { state });
            }

            return send(res, 404, { error: 'not found' });
        } catch (e: any) {
            return send(res, 500, { error: String(e?.message ?? e) });
        }
    });

    // ── the WS push channel (same port, /live) ───────────────────────────────
    const wss = new WebSocketServer({ server, path: '/live' });
    const subs = new Map<WebSocket, Set<string>>();
    wss.on('connection', (socket) => {
        subs.set(socket, new Set());
        socket.on('message', (raw) => {
            try {
                const msg = JSON.parse(String(raw));
                if (msg.op === 'subscribe' && typeof msg.topic === 'string') subs.get(socket)?.add(msg.topic);
                else if (msg.op === 'unsubscribe' && typeof msg.topic === 'string') subs.get(socket)?.delete(msg.topic);
                else if (msg.op === 'ping') socket.send(JSON.stringify({ op: 'pong' }));
            } catch { /* ignore malformed frames */ }
        });
        socket.on('close', () => subs.delete(socket));
    });
    const broadcast = (topic: string, data: unknown): void => {
        const frame = JSON.stringify({ topic, data, ts: Date.now() });
        for (const [socket, topics] of subs) {
            if (topics.has(topic) && socket.readyState === WebSocket.OPEN) socket.send(frame);
        }
    };

    server.listen(port, '127.0.0.1', () => {
        console.log(`[${name}] Septopus dev game server → http://127.0.0.1:${port} (game: ${name}; http + ws/live)`);
    });
    return server;
}
