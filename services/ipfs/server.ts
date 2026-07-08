/**
 * Septopus dev IPFS gateway — the REALISTIC network tier of the content stack.
 *
 * A file-backed CAS over HTTP whose CIDs are IDENTICAL to the engine's
 * in-process CAS (it imports the engine's Cid.ts — same sha256+base32 pure
 * function, zero drift; the router's read-back integrity check therefore
 * accepts our bytes). The in-process MemoryCasProvider stays as tier-1
 * (local node / cache / offline PWA fallback); this service is the tier the
 * IpfsRouter falls through to on a miss — exactly a real IPFS node+gateway
 * shape. Swap BASE for a real gateway and nothing else changes.
 *
 * Boot SEEDS the shared content tree (truth stays versioned + bundled in
 * client/core for offline; this serves a derived, content-addressed view):
 *   client/core/src/levels/*.level.json         → name  level:<base>
 *   client/core/src/blocks/*.block.json         → name  block:<base>
 *   client/core/src/worlds/*.world.json         → name  world:<base>
 *   client/core/src/stylepacks/*.stylepack.json → name  stylepack:<base>
 *   client/desktop/public/assets/*              → name  asset:<file>
 *
 * Routes (CORS-open; clients on 7777/7778 fetch cross-origin):
 *   GET  /v0/health        → { ok, provider, blobs, names }
 *   GET  /v0/names         → the whole name→cid index
 *   GET  /v0/name/<name>   → { name, cid }
 *   GET  /ipfs/<cid>       → blob bytes (content-type preserved from seed)
 *   POST /v0/add           → { cid }   (store raw body — the dev "ipfs add")
 *
 * Usage: PORT=7789 npm start   (deploy/dev.sh runs it on the dashboard)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cidForBytes } from '../../engine/src/core/services/ipfs/Cid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT || 7789);
const DATA = path.join(__dirname, 'data');
const BLOBS = path.join(DATA, 'blobs');
const NAMES_FILE = path.join(DATA, 'names.json');

const MIME: Record<string, string> = {
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
};

let names: Record<string, string> = {};          // name → cid
const types: Record<string, string> = {};        // cid → content-type (in-memory, re-derived by seed)

async function store(bytes: Uint8Array, type?: string): Promise<string> {
    const cid = await cidForBytes(bytes);
    const p = path.join(BLOBS, cid);
    if (!fs.existsSync(p)) fs.writeFileSync(p, bytes);
    if (type) types[cid] = type;
    return cid;
}

/** Idempotent content seed (content-addressed → stable CIDs across boots). */
async function seed(): Promise<void> {
    fs.mkdirSync(BLOBS, { recursive: true });
    names = {};
    const ingestDir = async (dir: string, suffix: string, prefix: string) => {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith(suffix)) continue;
            const bytes = fs.readFileSync(path.join(dir, f));
            const cid = await store(bytes, MIME[path.extname(f)] ?? 'application/octet-stream');
            names[`${prefix}:${f.slice(0, -suffix.length)}`] = cid;
        }
    };
    await ingestDir(path.join(ROOT, 'client/core/src/levels'), '.level.json', 'level');
    await ingestDir(path.join(ROOT, 'client/core/src/blocks'), '.block.json', 'block');
    await ingestDir(path.join(ROOT, 'client/core/src/worlds'), '.world.json', 'world');
    await ingestDir(path.join(ROOT, 'client/core/src/stylepacks'), '.stylepack.json', 'stylepack');
    const assets = path.join(ROOT, 'client/desktop/public/assets');
    if (fs.existsSync(assets)) {
        for (const f of fs.readdirSync(assets)) {
            const p = path.join(assets, f);
            if (!fs.statSync(p).isFile()) continue;
            const cid = await store(fs.readFileSync(p), MIME[path.extname(f)] ?? 'application/octet-stream');
            names[`asset:${f}`] = cid;
        }
    }
    fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2));
}

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
} as const;

/** API replies (objects → JSON). Blobs go through sendBlob — NEVER here, or a
 *  Buffer whose content-type is application/json would get JSON.stringify'd. */
function send(res: http.ServerResponse, code: number, body: any): void {
    const bytes = Buffer.from(JSON.stringify(body));
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': bytes.length, ...CORS });
    res.end(bytes);
}

/** Raw CAS bytes, verbatim (content-addressed → immutable cache). */
function sendBlob(res: http.ServerResponse, bytes: Buffer, type: string): void {
    res.writeHead(200, {
        'content-type': type, 'content-length': bytes.length, ...CORS,
        'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(bytes);
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`);
        if (req.method === 'OPTIONS') return send(res, 204, {});
        if (req.method === 'GET' && url.pathname === '/v0/health') {
            return send(res, 200, { ok: true, provider: 'file-cas', blobs: fs.readdirSync(BLOBS).length, names: Object.keys(names).length });
        }
        if (req.method === 'GET' && url.pathname === '/v0/names') return send(res, 200, names);
        if (req.method === 'GET' && url.pathname.startsWith('/v0/name/')) {
            const name = decodeURIComponent(url.pathname.slice('/v0/name/'.length));
            const cid = names[name];
            return cid ? send(res, 200, { name, cid }) : send(res, 404, { error: `unknown name '${name}'` });
        }
        if (req.method === 'GET' && url.pathname.startsWith('/ipfs/')) {
            const cid = url.pathname.slice('/ipfs/'.length);
            const p = path.join(BLOBS, path.basename(cid)); // basename() bars traversal
            if (!fs.existsSync(p)) return send(res, 404, { error: 'not found', cid });
            return sendBlob(res, fs.readFileSync(p), types[cid] ?? 'application/octet-stream');
        }
        if (req.method === 'POST' && url.pathname === '/v0/add') {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const cid = await store(new Uint8Array(Buffer.concat(chunks)));
            return send(res, 200, { cid });
        }
        return send(res, 404, { error: 'no such route' });
    } catch (e: any) {
        return send(res, 500, { error: String(e?.message ?? e) });
    }
});

await seed();
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[ipfs] file-CAS gateway on :${PORT} — ${Object.keys(names).length} names, seed OK (cid = engine Cid.ts, zero drift)`);
});
