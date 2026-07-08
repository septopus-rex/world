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
    // ── boot-chain dev stand-in (protocol/cn|en/boot-chain.md §5) ────────────
    // A minimal PROOF loader (envelope: septopus.loader) + the anchor micro-format
    // record, so /boot walks the ENTIRE normative chain against this gateway:
    // anchor → ROOT_CID → envelope validation → loader executes → pulls world config.
    const worldCid = names['world:default'];
    const loaderDoc = {
        envelope: 1,
        format: 'septopus.loader',
        version: 1,
        meta: { name: 'dev-proof-loader', semver: '0.1.0' },
        world: worldCid,
        code: [
            "const el = document.getElementById('world') || document.body;",
            "fetch(boot.gateway + '/ipfs/' + boot.world).then(r => r.json()).then(cfg => {",
            "  el.innerHTML = '<h2 style=\"color:#6f6\">SEPTOPUS BOOT CHAIN OK</h2>'",
            "    + '<div>anchor: ' + boot.anchor.name + ' v' + boot.anchor.version + '</div>'",
            "    + '<div>root:   ' + boot.rootCid + '</div>'",
            "    + '<div>world:  ' + boot.world + '</div>'",
            "    + '<div>config: block=' + (cfg.block ? cfg.block.max : '?') + ' avatar=' + (cfg.player && cfg.player.avatar ? cfg.player.avatar.resource : '?') + '</div>';",
            "});",
        ].join('\n'),
    };
    const loaderCid = await store(new Uint8Array(Buffer.from(JSON.stringify(loaderDoc))), 'application/json');
    names['loader:dev'] = loaderCid;
    const anchorRecord = { p: 'septopus', name: 'world', version: '0.1.0', cid: loaderCid };
    const anchorCid = await store(new Uint8Array(Buffer.from(JSON.stringify(anchorRecord))), 'application/json');
    names['anchor:world'] = anchorCid;

    // ── the REAL chain loader (boot-chain.md §3): the mobile shell packed as a
    // single IIFE (client/mobile: npm run build:chain → dist-chain). code =
    // prelude (inject CSS + #root, set the asset base, start the world-config
    // fetch from the anchor-pinned CID) + the app bundle, plain concatenation.
    // Published under `anchor:septopus` — `anchor:world` stays the tiny protocol
    // stub so its e2e is independent of whether the bundle is built.
    const distJs = path.join(ROOT, 'client/mobile/dist-chain/app.js');
    const distCss = path.join(ROOT, 'client/mobile/dist-chain/style.css');
    if (fs.existsSync(distJs)) {
        const appJs = fs.readFileSync(distJs, 'utf8');
        const cssText = fs.existsSync(distCss) ? fs.readFileSync(distCss, 'utf8') : '';
        const prelude = [
            '(function(){',
            `  var css = ${JSON.stringify(cssText)};`,
            "  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);",
            "  if (!document.getElementById('root')) { var r = document.createElement('div'); r.id = 'root'; document.body.appendChild(r); }",
            "  window.__SEPTOPUS_ASSET_BASE__ = boot.gateway;",
            "  window.__SEPTOPUS_WORLD_CONFIG_PROMISE__ = fetch(boot.gateway + '/ipfs/' + boot.world).then(function(r){ return r.json(); }).catch(function(){ return null; });",
            '})();',
        ].join('\n');
        const chainLoader = {
            envelope: 1,
            format: 'septopus.loader',
            version: 1,
            meta: { name: 'septopus-mobile', semver: '0.1.0' },
            world: worldCid,
            code: prelude + '\n;\n' + appJs,
        };
        const chainLoaderCid = await store(new Uint8Array(Buffer.from(JSON.stringify(chainLoader))), 'application/json');
        names['loader:chain'] = chainLoaderCid;
        const chainAnchor = { p: 'septopus', name: 'septopus', version: '0.1.0', cid: chainLoaderCid };
        names['anchor:septopus'] = await store(new Uint8Array(Buffer.from(JSON.stringify(chainAnchor))), 'application/json');
        console.log('[ipfs] chain loader seeded (dist-chain) →', chainLoaderCid.slice(0, 24) + '…');
    } else {
        console.log('[ipfs] no client/mobile/dist-chain — chain loader not seeded (run: bash deploy/publish-chain.sh)');
    }

    fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2));
    writeHumanMirror();
}

/**
 * Human-readable mirror of the CAS (便于人工核实): blobs/ stays the single
 * canonical store (opaque CID filenames); this lays SYMLINKS into a browsable
 * tree — app artifacts vs content data, foldered by kind. Zero duplication:
 * every entry links back into blobs/<cid>.
 *
 *   data/
 *   ├── blobs/<cid>                  canonical CAS (source of truth)
 *   ├── names.json                   name → cid index
 *   ├── app/                         chain app artifacts
 *   │   ├── anchor.<name>.json       锚记录(微格式)
 *   │   ├── loader.<name>.json       septopus.loader 文档
 *   │   └── app.js / style.css       构建产物副本(dist-chain,便于 diff)
 *   └── content/                     world data, by kind
 *       ├── levels|blocks|worlds|stylepacks/<n>.<kind>.json
 *       └── assets/<file>
 */
function writeHumanMirror(): void {
    const APP = path.join(DATA, 'app');
    const CONTENT = path.join(DATA, 'content');
    fs.rmSync(APP, { recursive: true, force: true });
    fs.rmSync(CONTENT, { recursive: true, force: true });
    const link = (dir: string, file: string, cid: string) => {
        fs.mkdirSync(dir, { recursive: true });
        const from = path.join(dir, file);
        const rel = path.relative(dir, path.join(BLOBS, cid));
        try { fs.symlinkSync(rel, from); } catch { /* exists / unsupported fs — mirror is best-effort */ }
    };
    const KIND_DIRS: Record<string, [string, string]> = {
        level: [path.join(CONTENT, 'levels'), '.level.json'],
        block: [path.join(CONTENT, 'blocks'), '.block.json'],
        world: [path.join(CONTENT, 'worlds'), '.world.json'],
        stylepack: [path.join(CONTENT, 'stylepacks'), '.stylepack.json'],
    };
    for (const [name, cid] of Object.entries(names)) {
        const i = name.indexOf(':');
        const kind = name.slice(0, i), n = name.slice(i + 1);
        if (kind === 'asset') link(path.join(CONTENT, 'assets'), n, cid);
        else if (kind === 'anchor') link(APP, `anchor.${n}.json`, cid);
        else if (kind === 'loader') link(APP, `loader.${n}.json`, cid);
        else if (KIND_DIRS[kind]) link(KIND_DIRS[kind][0], n + KIND_DIRS[kind][1], cid);
    }
    // Raw build artifacts (when built) — plain copies for eyeballing/diffing the
    // exact bytes that were packed into loader.chain.json's `code`.
    const distJs = path.join(ROOT, 'client/mobile/dist-chain/app.js');
    const distCss = path.join(ROOT, 'client/mobile/dist-chain/style.css');
    if (fs.existsSync(distJs)) { fs.mkdirSync(APP, { recursive: true }); fs.copyFileSync(distJs, path.join(APP, 'app.js')); }
    if (fs.existsSync(distCss)) { fs.copyFileSync(distCss, path.join(APP, 'style.css')); }
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
        if (req.method === 'GET' && url.pathname === '/boot') {
            // The dev boot shim (boot-chain.md §4/§5) — served by the gateway so the
            // whole rehearsal is one origin. The shim re-implements CID integrity
            // itself (it IS the trust root; zero dependencies).
            const html = fs.readFileSync(path.join(__dirname, 'shim.html'));
            return sendBlob(res, html, 'text/html; charset=utf-8');
        }
        if (req.method === 'GET' && url.pathname === '/v0/names') return send(res, 200, names);
        if (req.method === 'GET' && url.pathname.startsWith('/v0/name/')) {
            const name = decodeURIComponent(url.pathname.slice('/v0/name/'.length));
            const cid = names[name];
            return cid ? send(res, 200, { name, cid }) : send(res, 404, { error: `unknown name '${name}'` });
        }
        if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
            // Asset path shape the world uses (A3): name index `asset:<file>` → CAS
            // blob. Content IS content-addressed underneath; this route is the
            // mutable human-path front (same discipline as /v0/name).
            const file = decodeURIComponent(url.pathname.slice('/assets/'.length));
            const cid = names['asset:' + path.basename(file)];
            if (!cid) return send(res, 404, { error: 'unknown asset', file });
            const p2 = path.join(BLOBS, cid);
            if (!fs.existsSync(p2)) return send(res, 404, { error: 'blob missing', cid });
            return sendBlob(res, fs.readFileSync(p2), types[cid] ?? 'application/octet-stream');
        }
        if (req.method === 'GET' && url.pathname.startsWith('/ipfs/')) {
            const cid = url.pathname.slice('/ipfs/'.length);
            const p = path.join(BLOBS, path.basename(cid)); // basename() bars traversal
            if (!fs.existsSync(p)) return send(res, 404, { error: 'not found', cid });
            return sendBlob(res, fs.readFileSync(p), types[cid] ?? 'application/octet-stream');
        }
        if (req.method === 'POST' && url.pathname === '/v0/reseed') {
            await seed();
            return send(res, 200, { ok: true, names: Object.keys(names).length });
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
