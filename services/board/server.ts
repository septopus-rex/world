/**
 * Septopus dev BOARD SERVER (7786) — the mutable-shared-state service behind
 * the e5 board adjunct (message walls / guestbooks).
 *
 * An e5 board's raw carries only a `channel` id — the messages live HERE, not
 * in world data (world data = immutable content by CID; a guestbook is session
 * state, same reasoning that keeps game sessions off-chain, game.md §9).
 * Channel-keyed, JSON-file persisted, capped per channel.
 *
 *   GET  /v0/health                  → { ok, service, channels }
 *   GET  /v0/list?channel=<id>       → { channel, messages: [{author,text,at}] }
 *   POST /v0/post {channel,author,text} → { ok, message }
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 7786);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');
const FILE = path.join(DATA, 'messages.json');
const MAX_PER_CHANNEL = 200;
const MAX_TEXT = 500;

type Msg = { author: string; text: string; at: number };
let channels: Record<string, Msg[]> = {};
try { channels = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { channels = {}; }

function persist(): void {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(channels, null, 2));
}

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
            return send(res, 200, { ok: true, service: 'board', channels: Object.keys(channels).length });
        }
        if (req.method === 'GET' && url.pathname === '/v0/list') {
            const channel = url.searchParams.get('channel') ?? 'lobby';
            return send(res, 200, { channel, messages: channels[channel] ?? [] });
        }
        if (req.method === 'POST' && url.pathname === '/v0/post') {
            const { channel = 'lobby', author = '游客', text = '' } = await readJson(req);
            const clean = String(text).trim().slice(0, MAX_TEXT);
            if (!clean) return send(res, 400, { error: 'empty message' });
            const msg: Msg = { author: String(author).trim().slice(0, 40) || '游客', text: clean, at: Date.now() };
            const list = (channels[String(channel)] ??= []);
            list.push(msg);
            if (list.length > MAX_PER_CHANNEL) list.splice(0, list.length - MAX_PER_CHANNEL);
            persist();
            console.log(`[board] ${channel} ← ${msg.author}: ${clean.slice(0, 40)}`);
            return send(res, 200, { ok: true, message: msg });
        }
        return send(res, 404, { error: 'not found' });
    } catch (e: any) {
        return send(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[board] Septopus dev board server → http://127.0.0.1:${PORT}`);
});
