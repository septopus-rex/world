/**
 * Septopus World Labs gateway — AI-generated-3D-world demo (gallery ㉑).
 *
 * THIN: prompt → provider (mock/real) → job id, polled by the client until a
 * splat URL comes back. Real generation takes ~5 minutes and costs Marble
 * credits — default provider is `mock` (instant, offline, free); flip with
 * WORLDLABS_PROVIDER=real WORLDLABS_API_KEY=… (key in private.md, gitignored).
 *
 *   GET  /v0/health           → { ok, provider }
 *   POST /v0/generate {prompt}→ { jobId } | { error }
 *   GET  /v0/jobs/:id         → { done, status?, error?, splatUrl?, thumbnailUrl? }
 *   GET  /assets/generated/*  → the downloaded/mock splat bytes (static, single segment)
 *
 *   WORLDLABS_PROVIDER=mock|real  WORLDLABS_API_KEY=…  PORT=7790  npx tsx server.ts
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { makeProvider, GENERATED_DIR, type JobResult } from './providers';

const PORT = Number(process.env.PORT || 7790);
const MAX_BODY = 8 * 1024;
const provider = makeProvider();
/** The dev CAS gateway (services/ipfs) — finished splats are ingested there so
 *  the client can persist them as content-addressed block data (`<cid>.<ext>`
 *  a4 resource) instead of a mutable URL into this process's disk. */
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'http://127.0.0.1:7789';

// Real generation costs money + ~5 minutes — a much tighter per-process quota
// than a text gateway's. Mock is unmetered (no cost, nothing to protect).
const QUOTA_PER_HOUR = Number(process.env.QUOTA_PER_HOUR || (provider.name === 'mock' ? Infinity : 5));
let quotaWindow = 0, quotaCount = 0;
function underQuota(): boolean {
    if (!Number.isFinite(QUOTA_PER_HOUR)) return true;
    const hour = Math.floor(Date.now() / 3_600_000);
    if (hour !== quotaWindow) { quotaWindow = hour; quotaCount = 0; }
    return ++quotaCount <= QUOTA_PER_HOUR;
}

// jobId → last known result. Terminal (done) results are cached instead of
// re-asking the provider (a completed Marble operation eventually expires —
// see `expires_at` in the API — and there's nothing left to poll for anyway).
const jobs = new Map<string, JobResult>();

function json(res: http.ServerResponse, status: number, body: any): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let size = 0; const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => {
            size += c.length;
            if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
            catch { reject(new Error('invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

const MIME: Record<string, string> = {
    '.spz': 'application/octet-stream',
    '.ply': 'application/octet-stream',
    '.splat': 'application/octet-stream',
    '.ksplat': 'application/octet-stream',
};

/** Ingest a finished splat into the CAS gateway → its CID, or undefined when
 *  the gateway is down (session-only placement still works; the next poll of
 *  the same job retries, so a gateway restart heals without regenerating). */
async function ingestToCas(splatUrl: string): Promise<string | undefined> {
    try {
        const bytes = fs.readFileSync(path.join(GENERATED_DIR, path.basename(splatUrl)));
        const res = await fetch(`${IPFS_GATEWAY}/v0/add`, { method: 'POST', body: bytes });
        if (!res.ok) return undefined;
        const cid = (await res.json() as any)?.cid;
        return typeof cid === 'string' ? cid : undefined;
    } catch {
        return undefined;
    }
}

async function pollJob(jobId: string): Promise<JobResult> {
    const cached = jobs.get(jobId);
    if (cached?.done) {
        // Terminal — nothing left to ask the provider; only a missing CAS ingest
        // (gateway was down when the job finished) is worth retrying.
        if (cached.splatUrl && !cached.error && !cached.cid) {
            cached.cid = await ingestToCas(cached.splatUrl);
        }
        return cached;
    }
    try {
        const result = await provider.poll(jobId);
        if (result.done && result.splatUrl && !result.error) {
            result.cid = await ingestToCas(result.splatUrl);
        }
        jobs.set(jobId, result);
        return result;
    } catch (e: any) {
        const result: JobResult = { done: true, error: String(e?.message ?? e) };
        jobs.set(jobId, result);
        return result;
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (req.method === 'OPTIONS') return json(res, 204, {});
    try {
        if (req.method === 'GET' && url.pathname === '/v0/health') {
            return json(res, 200, { ok: true, provider: provider.name });
        }

        if (req.method === 'POST' && url.pathname === '/v0/generate') {
            if (!underQuota()) return json(res, 429, { error: 'quota_exceeded' });
            const body = await readBody(req);
            const prompt = String(body.prompt ?? '').slice(0, 500);
            if (!prompt.trim()) return json(res, 400, { error: 'prompt required' });
            try {
                const jobId = await provider.start(prompt);
                jobs.set(jobId, { done: false, status: 'queued' });
                return json(res, 200, { jobId });
            } catch (e: any) {
                return json(res, 502, { error: String(e?.message ?? e) });
            }
        }

        const jobMatch = req.method === 'GET' && url.pathname.match(/^\/v0\/jobs\/([\w.-]+)$/);
        if (jobMatch) {
            return json(res, 200, await pollJob(jobMatch[1]));
        }

        if (req.method === 'GET' && url.pathname.startsWith('/assets/generated/')) {
            const file = decodeURIComponent(url.pathname.slice('/assets/generated/'.length));
            if (!file || file.includes('..') || file.includes('/')) return json(res, 400, { error: 'bad filename' });
            const p = path.join(GENERATED_DIR, file);
            if (!fs.existsSync(p)) return json(res, 404, { error: 'not found' });
            const bytes = fs.readFileSync(p);
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': bytes.length,
            });
            return res.end(bytes);
        }

        return json(res, 404, { error: 'not found' });
    } catch (e: any) {
        return json(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, () => {
    console.log(`[worldlabs] listening on :${PORT} (provider: ${provider.name})`);
});
