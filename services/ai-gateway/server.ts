/**
 * Septopus AI authoring gateway (spec docs/plan/specs/ai-authoring.md §4B).
 *
 * THIN and STATELESS by design: prompt assembly + provider adapter + shared-
 * schema validation (+ retry feed-back) + a simple per-process quota. World
 * state arrives WITH the request as a snapshot and leaves with the response —
 * the client stays the source of truth (local-first).
 *
 *   GET  /v0/health   → { ok, provider }
 *   GET  /v0/catalog  → generator catalog + direct-row whitelist
 *   POST /v0/generate { prompt, snapshot? }            → { plan, doc }
 *   POST /v0/revise   { prompt, doc, snapshot? }       → { plan, doc }
 *
 * Validation runs HERE (saves a round trip and tokens) and AGAIN client-side
 * before inject — never trust the wire. Same GenerationDoc.ts on both ends.
 *
 *   PROVIDER=mock|qwen  DASHSCOPE_API_KEY=…  PORT=7788  npx tsx server.ts
 */
import http from 'node:http';
import { validateGenerationDoc, GEN_ADJUNCT_WHITELIST, GEN_LIMITS } from '../../engine/src/core/protocol/GenerationDoc';
import { motifTemplateIds } from '../../engine/src/core/motif/MotifTemplates';
import { makeProvider } from './providers';
import { buildMessages } from './prompts';

const PORT = Number(process.env.PORT || 7788);
const MAX_BODY = 64 * 1024;
const MAX_RETRIES = 2;
const provider = makeProvider();

// Per-process sliding-hour quota — abuse brake, not billing.
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

/** One generate/revise round with the validation-feedback retry loop. */
async function generate(prompt: string, snapshot: any, priorDoc: any): Promise<any> {
    let validationErrors: any[] | undefined;
    let lastRaw = '';
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const messages = buildMessages({ prompt, snapshot, priorDoc, validationErrors });
        lastRaw = await provider.complete(messages);
        const parsed = parseCompletion(lastRaw);
        if (!parsed?.doc) {
            validationErrors = [{ code: 'doc', path: '$', msg: 'output was not {"plan","doc"} JSON' }];
            continue;
        }
        // The model must build for the requested block — pin it, don't trust it.
        if (snapshot?.targetBlock) parsed.doc.target = { ...(parsed.doc.target ?? {}), block: snapshot.targetBlock };
        const errors = validateGenerationDoc(parsed.doc);
        if (errors.length === 0) {
            return { plan: String(parsed.plan ?? parsed.doc.summary ?? ''), doc: parsed.doc, attempts: attempt + 1 };
        }
        validationErrors = errors;
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
                generators: motifTemplateIds(),
                whitelistTypeIds: [...GEN_ADJUNCT_WHITELIST],
                limits: GEN_LIMITS,
            });
        }
        if (req.method === 'POST' && (url.pathname === '/v0/generate' || url.pathname === '/v0/revise')) {
            if (!underQuota()) return json(res, 429, { error: 'quota_exceeded' });
            const body = await readBody(req);
            const prompt = String(body.prompt ?? '').slice(0, 2000);
            if (!prompt.trim()) return json(res, 400, { error: 'prompt required' });
            const priorDoc = url.pathname === '/v0/revise' ? body.doc ?? null : null;
            const result = await generate(prompt, body.snapshot ?? null, priorDoc);
            return json(res, result.error ? 422 : 200, result);
        }
        return json(res, 404, { error: 'not found' });
    } catch (e: any) {
        return json(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, () => {
    console.log(`[ai-gateway] listening on :${PORT} (provider: ${provider.name})`);
});
