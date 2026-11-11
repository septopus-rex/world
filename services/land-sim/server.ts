/**
 * Septopus SIMULATED LAND REGISTRY (7792) — shared multiplayer stand-in for the
 * Solana `septopus_land` program (protocol/cn|en/land.md) before connecting real
 * browser wallets.
 *
 * Every account starts with 10 SOL (10_000_000_000 lamports) on first connect,
 * authenticated by a client-held bearer secret (`Authorization: Bearer <secret>`)
 * whose SHA-256 deterministically derives its Base58 address — zero browser
 * extension required, yet another player cannot spoof your address from DevTools.
 *
 * State machine mirrors `chain/programs/septopus_land/src/lib.rs` 1:1:
 *   unminted ──(mint: pay mintPrice)──▶ owned ──(list: price > 0, freezes edits)──▶ listed
 *                                         ▲                                            │
 *                                         └────(delist OR buy: atomic SOL settlement)──┘
 *
 * Routes (CORS-open):
 *   GET  /v0/health                → { ok, service, worlds, accounts, blocks }
 *   GET  /v0/info?world=septopus   → { ok, info: LandWorldInfo }
 *   POST /v0/wallet/connect        → { ok, address, balance }  (body: { secret })
 *   GET  /v0/wallet/balance        → { ok, balance }           (?address=...)
 *   POST /v0/blocks                → { ok, blocks }            (body: { world, coords })
 *   GET  /v0/market?world=septopus → { ok, blocks }            (all non-unminted blocks)
 *   POST /v0/mint                  → { ok, signature, balance, block }
 *   POST /v0/set-content           → { ok, signature, block }
 *   POST /v0/list                  → { ok, signature, block }
 *   POST /v0/delist                → { ok, signature, block }
 *   POST /v0/buy                   → { ok, signature, balance, block }
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isCid } from '../../engine/src/core/services/ipfs/Cid';

const PORT = Number(process.env.PORT ?? 7792);
const HOST = process.env.HOST ?? '127.0.0.1';
const INITIAL_SOL = Number(process.env.INITIAL_SOL ?? 10);
const LAMPORTS_PER_SOL = 1_000_000_000;
const INITIAL_BALANCE = Math.round(INITIAL_SOL * LAMPORTS_PER_SOL);
const DEFAULT_MINT_PRICE = Number(process.env.MINT_PRICE ?? 100_000_000); // 0.1 SOL
const DEFAULT_RANGE: [number, number] = [4096, 4096];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

type LandStatus = 'unminted' | 'owned' | 'listed' | 'banned';

interface SimWorld {
    world: string;
    range: [number, number];
    mintPrice: number;
    minted: number;
    frozen: boolean;
}

interface SimAccount {
    address: string;
    authHash: string;
    balance: number;
    createdAt: number;
}

interface SimBlock {
    x: number;
    y: number;
    status: Exclude<LandStatus, 'unminted'>;
    owner: string;
    cid: string | null;
    price: number;
    revision: number;
    updatedAt: number;
}

interface Ledger {
    worlds: Record<string, SimWorld>;
    accounts: Record<string, SimAccount>;
    blocks: Record<string, Record<string, SimBlock>>; // world -> "x_y" -> SimBlock
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(bytes: Uint8Array): string {
    const digits = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    let out = '';
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
    for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]];
    return out;
}

function sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

/** Deterministic Solana-shaped Base58 address derived from the client's secret. */
function deriveAddress(secret: string): string {
    const digest = crypto.createHash('sha256').update(`septopus.sim.addr.v1:${secret}`).digest();
    return toBase58(digest);
}

function deriveAuthHash(secret: string): string {
    return sha256Hex(`septopus.sim.auth.v1:${secret}`);
}

function makeTxSig(): string {
    return `sim_${crypto.randomBytes(24).toString('hex')}`;
}

let ledger: Ledger = { worlds: {}, accounts: {}, blocks: {} };
try {
    const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
        ledger = {
            worlds: raw.worlds ?? {},
            accounts: raw.accounts ?? {},
            blocks: raw.blocks ?? {},
        };
    }
} catch { /* fresh ledger */ }

function persist(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${LEDGER_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
    fs.renameSync(tmp, LEDGER_FILE);
}

function ensureWorld(name = 'septopus'): SimWorld {
    const clean = String(name || 'septopus').trim().slice(0, 32) || 'septopus';
    if (!ledger.worlds[clean]) {
        ledger.worlds[clean] = {
            world: clean,
            range: [...DEFAULT_RANGE],
            mintPrice: DEFAULT_MINT_PRICE,
            minted: 0,
            frozen: false,
        };
        ledger.blocks[clean] ??= {};
        persist();
    }
    ledger.blocks[clean] ??= {};
    return ledger.worlds[clean];
}

function ensureAccount(secret: string): SimAccount {
    const trimmed = String(secret || '').trim();
    if (trimmed.length < 8) throw new Error('invalid wallet secret');
    const address = deriveAddress(trimmed);
    const authHash = deriveAuthHash(trimmed);
    const existing = ledger.accounts[address];
    if (existing) {
        if (existing.authHash !== authHash) throw new Error('wallet secret mismatch');
        return existing;
    }
    const created: SimAccount = {
        address,
        authHash,
        balance: INITIAL_BALANCE,
        createdAt: Date.now(),
    };
    ledger.accounts[address] = created;
    persist();
    console.log(`[land-sim] +wallet ${address.slice(0, 8)}… funded with ${INITIAL_SOL} SOL`);
    return created;
}

function requireAuth(req: http.IncomingMessage): SimAccount {
    const hdr = String(req.headers.authorization ?? '');
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    if (!m) throw new Error('wallet not connected (missing Bearer token)');
    return ensureAccount(m[1]);
}

function toWireBlock(worldName: string, x: number, y: number) {
    const b = ledger.blocks[worldName]?.[`${x}_${y}`];
    if (!b) {
        return { x, y, status: 'unminted' as const, owner: null, cid: null, price: 0, revision: 0 };
    }
    return {
        x: b.x,
        y: b.y,
        status: b.status,
        owner: b.owner,
        cid: b.cid,
        price: b.price,
        revision: b.revision,
    };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
    const bytes = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'content-length': bytes.length,
    });
    res.end(bytes);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of req) {
        total += (c as Buffer).length;
        if (total > 256 * 1024) throw new Error('payload too large');
        chunks.push(c as Buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
        return {};
    }
}

function checkCoord(w: SimWorld, x: unknown, y: unknown): [number, number] {
    const bx = Number(x), by = Number(y);
    if (!Number.isInteger(bx) || !Number.isInteger(by) || bx < 1 || by < 1 || bx > w.range[0] || by > w.range[1]) {
        throw new Error(`block coordinate [${x}, ${y}] outside world.range [${w.range[0]}, ${w.range[1]}]`);
    }
    return [bx, by];
}

// Seed the default world on startup so /v0/info is ready immediately.
ensureWorld('septopus');

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    try {
        if (req.method === 'OPTIONS') return send(res, 204, {});

        if (req.method === 'GET' && url.pathname === '/v0/health') {
            const blockCount = Object.values(ledger.blocks).reduce((n, m) => n + Object.keys(m).length, 0);
            return send(res, 200, {
                ok: true,
                service: 'land-sim',
                worlds: Object.keys(ledger.worlds).length,
                accounts: Object.keys(ledger.accounts).length,
                blocks: blockCount,
            });
        }

        if (req.method === 'GET' && url.pathname === '/v0/info') {
            const w = ensureWorld(url.searchParams.get('world') ?? 'septopus');
            return send(res, 200, {
                ok: true,
                info: {
                    chain: 'sim',
                    world: w.world,
                    mintPrice: w.mintPrice,
                    range: w.range,
                    minted: w.minted,
                    frozen: w.frozen,
                    unit: 'SOL',
                    decimals: 9,
                },
            });
        }

        if (req.method === 'POST' && url.pathname === '/v0/wallet/connect') {
            const { secret } = await readJson(req);
            const acc = ensureAccount(secret);
            return send(res, 200, { ok: true, address: acc.address, balance: acc.balance });
        }

        if (req.method === 'GET' && url.pathname === '/v0/wallet/balance') {
            const addr = String(url.searchParams.get('address') ?? '').trim();
            const acc = ledger.accounts[addr];
            return send(res, 200, { ok: true, balance: acc ? acc.balance : 0 });
        }

        if (req.method === 'POST' && url.pathname === '/v0/blocks') {
            const { world = 'septopus', coords = [] } = await readJson(req);
            ensureWorld(world);
            if (!Array.isArray(coords)) return send(res, 400, { ok: false, error: 'coords must be an array' });
            const capped = coords.slice(0, 1024);
            const blocks = capped.map((pair: any) => {
                const bx = Number(pair?.[0]), by = Number(pair?.[1]);
                return toWireBlock(world, bx, by);
            });
            return send(res, 200, { ok: true, blocks });
        }

        if (req.method === 'GET' && url.pathname === '/v0/market') {
            const worldName = url.searchParams.get('world') ?? 'septopus';
            ensureWorld(worldName);
            const map = ledger.blocks[worldName] ?? {};
            const blocks = Object.values(map).map((b) => toWireBlock(worldName, b.x, b.y));
            return send(res, 200, { ok: true, blocks });
        }

        if (req.method === 'POST' && url.pathname === '/v0/mint') {
            const caller = requireAuth(req);
            const { world = 'septopus', x, y } = await readJson(req);
            const w = ensureWorld(world);
            if (w.frozen) return send(res, 400, { ok: false, error: 'minting is frozen for this world' });
            const [bx, by] = checkCoord(w, x, y);
            const key = `${bx}_${by}`;
            if (ledger.blocks[w.world][key]) {
                return send(res, 400, { ok: false, error: `地块 [${bx}, ${by}] 已被认领` });
            }
            if (caller.balance < w.mintPrice) {
                return send(res, 400, { ok: false, error: '模拟钱包 SOL 余额不足' });
            }
            caller.balance -= w.mintPrice;
            ledger.blocks[w.world][key] = {
                x: bx,
                y: by,
                status: 'owned',
                owner: caller.address,
                cid: null,
                price: 0,
                revision: 0,
                updatedAt: Date.now(),
            };
            w.minted += 1;
            persist();
            const sig = makeTxSig();
            console.log(`[land-sim] mint [${bx},${by}] by ${caller.address.slice(0, 8)}… (${sig.slice(0, 14)}…)`);
            return send(res, 200, { ok: true, signature: sig, balance: caller.balance, block: toWireBlock(w.world, bx, by) });
        }

        if (req.method === 'POST' && url.pathname === '/v0/set-content') {
            const caller = requireAuth(req);
            const { world = 'septopus', x, y, cid = null } = await readJson(req);
            const w = ensureWorld(world);
            const [bx, by] = checkCoord(w, x, y);
            const b = ledger.blocks[w.world][`${bx}_${by}`];
            if (!b || b.owner !== caller.address) {
                return send(res, 403, { ok: false, error: '你不是该地块的所有者' });
            }
            if (b.status === 'banned') return send(res, 400, { ok: false, error: '该地块已被封禁' });
            if (b.status === 'listed') return send(res, 400, { ok: false, error: '挂单期间不可修改地块内容，请先撤单' });
            if (cid !== null && (typeof cid !== 'string' || !isCid(cid))) {
                return send(res, 400, { ok: false, error: `无效的 CIDv1(raw) 格式: ${String(cid)}` });
            }
            b.cid = cid;
            b.revision += 1;
            b.updatedAt = Date.now();
            persist();
            const sig = makeTxSig();
            console.log(`[land-sim] setContent [${bx},${by}] rev=${b.revision} cid=${cid ? cid.slice(0, 12) + '…' : 'null'}`);
            return send(res, 200, { ok: true, signature: sig, block: toWireBlock(w.world, bx, by) });
        }

        if (req.method === 'POST' && url.pathname === '/v0/list') {
            const caller = requireAuth(req);
            const { world = 'septopus', x, y, price } = await readJson(req);
            const w = ensureWorld(world);
            const [bx, by] = checkCoord(w, x, y);
            const lamports = Math.round(Number(price));
            if (!Number.isFinite(lamports) || lamports <= 0) {
                return send(res, 400, { ok: false, error: '挂单价格必须大于 0' });
            }
            const b = ledger.blocks[w.world][`${bx}_${by}`];
            if (!b || b.owner !== caller.address) {
                return send(res, 403, { ok: false, error: '你不是该地块的所有者' });
            }
            if (b.status === 'banned') return send(res, 400, { ok: false, error: '该地块已被封禁' });
            b.price = lamports;
            b.status = 'listed';
            b.updatedAt = Date.now();
            persist();
            const sig = makeTxSig();
            console.log(`[land-sim] list [${bx},${by}] price=${lamports} lamports`);
            return send(res, 200, { ok: true, signature: sig, block: toWireBlock(w.world, bx, by) });
        }

        if (req.method === 'POST' && url.pathname === '/v0/delist') {
            const caller = requireAuth(req);
            const { world = 'septopus', x, y } = await readJson(req);
            const w = ensureWorld(world);
            const [bx, by] = checkCoord(w, x, y);
            const b = ledger.blocks[w.world][`${bx}_${by}`];
            if (!b || b.owner !== caller.address) {
                return send(res, 403, { ok: false, error: '你不是该地块的所有者' });
            }
            if (b.status !== 'listed') {
                return send(res, 400, { ok: false, error: '该地块当前未在售' });
            }
            b.price = 0;
            b.status = 'owned';
            b.updatedAt = Date.now();
            persist();
            const sig = makeTxSig();
            return send(res, 200, { ok: true, signature: sig, block: toWireBlock(w.world, bx, by) });
        }

        if (req.method === 'POST' && url.pathname === '/v0/buy') {
            const buyer = requireAuth(req);
            const { world = 'septopus', x, y, expectedPrice } = await readJson(req);
            const w = ensureWorld(world);
            const [bx, by] = checkCoord(w, x, y);
            const b = ledger.blocks[w.world][`${bx}_${by}`];
            if (!b || b.status !== 'listed') {
                return send(res, 400, { ok: false, error: '该地块当前未挂单出售' });
            }
            const expected = Math.round(Number(expectedPrice));
            if (b.price !== expected) {
                return send(res, 400, { ok: false, error: '链上挂单价格已变动，请刷新后重试' });
            }
            if (b.owner === buyer.address) {
                return send(res, 400, { ok: false, error: '不能购买自己的地块' });
            }
            if (buyer.balance < b.price) {
                return send(res, 400, { ok: false, error: '模拟钱包 SOL 余额不足' });
            }
            const seller = ledger.accounts[b.owner];
            buyer.balance -= b.price;
            if (seller) seller.balance += b.price;
            const prevOwner = b.owner;
            b.owner = buyer.address;
            b.price = 0;
            b.status = 'owned';
            b.updatedAt = Date.now();
            persist();
            const sig = makeTxSig();
            console.log(`[land-sim] buy [${bx},${by}] ${prevOwner.slice(0, 6)}… → ${buyer.address.slice(0, 6)}… (${expected} lamports)`);
            return send(res, 200, { ok: true, signature: sig, balance: buyer.balance, block: toWireBlock(w.world, bx, by) });
        }

        return send(res, 404, { ok: false, error: 'not found' });
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        const code = msg.includes('wallet not connected') || msg.includes('mismatch') ? 401 : 400;
        return send(res, code, { ok: false, error: msg });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[land-sim] Septopus simulated land & 10-SOL wallet ledger → http://${HOST}:${PORT}`);
});
