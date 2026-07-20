/**
 * Septopus AI-builder gateway (spec docs/plan/specs/ai-builder.md).
 *
 * Experimental sibling of services/ai-gateway: same GenerationDoc contract,
 * a different generation STRATEGY — direct adjunct rows as the primary tool
 * (not a 12-type point-decoration on top of generator templates), guarded by
 * a server-side spatial collision check (real AABB overlap, not just a
 * prompt-only "please leave a gap" plea) with regenerate-on-conflict.
 * Independent process/port so this strategy can be tested without touching
 * the shipped v1 gateway.
 *
 *   GET  /v0/health   → { ok, provider }
 *   GET  /v0/catalog  → { adjuncts, blockSchema, whitelistTypeIds, limits }
 *   POST /v0/generate { prompt, target:{block:[x,y]}, existing? }
 *                      → { plan, doc, attempts, warnings? }
 *
 * Validation runs in two passes after the LLM answers: schema (shared
 * validateGenerationDoc, same as v1) then spatial collision (collision.ts,
 * new). Either failure feeds back into the SAME retry loop as structured
 * errors — collision.ts's errors are GenError-shaped on purpose.
 *
 *   PROVIDER=mock|qwen  DASHSCOPE_API_KEY=…  npx tsx server.ts   (默认 7791)
 */
import http from 'node:http';
import { validateGenerationDoc, GEN_ADJUNCT_WHITELIST, GEN_LIMITS } from '../../engine/src/core/protocol/GenerationDoc';
import { makeProvider } from '../ai-gateway/providers';
import { buildMessages } from './prompts';
import { buildAdjunctCatalog, BLOCK_SCHEMA_TEXT } from './catalog';
import { detectCollisions } from './collision';

// 7791 — 7790 是 worldlabs（客户端 ServiceHub / playwright / e2e 都锚在它上面）。
const PORT = Number(process.env.PORT || 7791);
const MAX_BODY = 64 * 1024;
// One more than v1's cap — collision is a second, independent failure axis on
// top of schema validation, so the same budget clears fewer rounds in practice.
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const provider = makeProvider();
const CATALOG = buildAdjunctCatalog();

// Per-process sliding-hour quota — abuse brake, not billing (same as v1).
let quotaWindow = 0, quotaCount = 0;
const QUOTA_PER_HOUR = Number(process.env.QUOTA_PER_HOUR || 120);
function underQuota(): boolean {
    const hour = Math.floor(Date.now() / 3_600_000);
    if (hour !== quotaWindow) { quotaWindow = hour; quotaCount = 0; }
    return ++quotaCount <= QUOTA_PER_HOUR;
}

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

/** Extract {plan, doc} from raw LLM text — tolerate code fences and prose. */
function parseCompletion(text: string): { plan?: string; doc?: any } | null {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    try { return JSON.parse(cleaned.slice(start)); } catch { /* try last } trim */ }
    const end = cleaned.lastIndexOf('}');
    if (end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* give up */ } }
    return null;
}

/** One generate round: schema validation, THEN spatial collision — both
 *  failure kinds feed the same retry loop. On exhaustion with at least one
 *  schema-valid candidate, degrade gracefully (return it + warnings) rather
 *  than hard-failing (v1 §2 "可降级" ethos, applied to a new failure axis). */
async function generate(prompt: string, target: [number, number], existing: any): Promise<any> {
    let validationErrors: any[] | undefined;
    let lastRaw = '';
    let lastValidDoc: any = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const messages = buildMessages({ prompt, target: { block: target }, existing, validationErrors });
        lastRaw = await provider.complete(messages);
        const parsed = parseCompletion(lastRaw);
        if (!parsed?.doc) {
            validationErrors = [{ code: 'doc', path: '$', msg: 'output was not {"plan","doc"} JSON' }];
            continue;
        }
        // The model must build for the requested block — pin it, don't trust it.
        parsed.doc.target = { ...(parsed.doc.target ?? {}), block: target };
        const schemaErrors = validateGenerationDoc(parsed.doc);
        if (schemaErrors.length > 0) {
            validationErrors = schemaErrors;
            continue;
        }
        lastValidDoc = parsed.doc;
        const collisionErrors = detectCollisions(parsed.doc, existing);
        if (collisionErrors.length === 0) {
            return { plan: String(parsed.plan ?? parsed.doc.summary ?? ''), doc: parsed.doc, attempts: attempt + 1 };
        }
        validationErrors = collisionErrors;
    }
    if (lastValidDoc) {
        return {
            plan: String(lastValidDoc.summary ?? ''),
            doc: lastValidDoc,
            attempts: MAX_RETRIES + 1,
            warnings: validationErrors,
        };
    }
    return { error: 'validation_failed', errors: validationErrors, raw: lastRaw.slice(0, 2000) };
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (req.method === 'OPTIONS') return json(res, 204, {});
    try {
        if (req.method === 'GET' && url.pathname === '/v0/health') {
            return json(res, 200, { ok: true, provider: provider.name });
        }
        if (req.method === 'GET' && url.pathname === '/v0/catalog') {
            return json(res, 200, {
                adjuncts: CATALOG,
                blockSchema: BLOCK_SCHEMA_TEXT,
                whitelistTypeIds: [...GEN_ADJUNCT_WHITELIST],
                limits: GEN_LIMITS,
            });
        }
        if (req.method === 'POST' && url.pathname === '/v0/generate') {
            if (!underQuota()) return json(res, 429, { error: 'quota_exceeded' });
            const body = await readBody(req);
            const prompt = String(body.prompt ?? '').slice(0, 2000);
            if (!prompt.trim()) return json(res, 400, { error: 'prompt required' });
            const block = body.target?.block;
            if (!Array.isArray(block) || block.length !== 2) {
                return json(res, 400, { error: 'target.block [x,y] required' });
            }
            const result = await generate(prompt, [block[0], block[1]], body.existing ?? null);
            return json(res, result.error ? 422 : 200, result);
        }
        return json(res, 404, { error: 'not found' });
    } catch (e: any) {
        return json(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, () => {
    console.log(`[ai-builder] listening on :${PORT} (provider: ${provider.name})`);
});
