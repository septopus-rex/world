/**
 * World Labs Marble World API provider adapters (docs.worldlabs.ai/api).
 * One interface, two backends — `mock` answers instantly and offline (CI/e2e/
 * default dev never spends real credits or waits the real ~5-minute
 * generation time); `real` speaks the actual Marble API and downloads the
 * resulting splat server-side, so the browser never needs to depend on
 * worldlabs.ai's CORS policy for the fetch that feeds ResourceManager.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Downloaded (real) / copied (mock) splat files, served back at /assets/generated/<file>. */
export const GENERATED_DIR = path.join(__dirname, 'generated');
fs.mkdirSync(GENERATED_DIR, { recursive: true });

export interface JobResult {
    done: boolean;
    /** Human-readable progress (while !done) or terminal status (once done). */
    status?: string;
    error?: string;
    /** Path under THIS service once done, e.g. /assets/generated/<jobId>.spz. */
    splatUrl?: string;
    thumbnailUrl?: string;
}

export interface WorldProvider {
    readonly name: string;
    /** Kick off a generation job for a text prompt; returns an opaque job id. */
    start(prompt: string): Promise<string>;
    /** Poll a job previously returned by start(). */
    poll(jobId: string): Promise<JobResult>;
}

// ── mock ─────────────────────────────────────────────────────────────────────
/**
 * Instant, deterministic, offline. Reuses the engine's existing synthetic test
 * splat (client/desktop/public/assets/test-splat.ply, from the Spark spike) —
 * no network, no cost, no 5-minute wait, and the full round-trip (generate →
 * poll → place) is still exercised end-to-end for tests/demo.
 */
export function mockProvider(): WorldProvider {
    const TEST_SPLAT = path.join(__dirname, '..', '..', 'client', 'desktop', 'public', 'assets', 'test-splat.ply');
    let seq = 0;
    return {
        name: 'mock',
        async start(_prompt) {
            return `mock-${++seq}-${Date.now().toString(36)}`;
        },
        async poll(jobId) {
            const dest = path.join(GENERATED_DIR, `${jobId}.ply`);
            if (!fs.existsSync(dest)) fs.copyFileSync(TEST_SPLAT, dest);
            return { done: true, status: 'SUCCEEDED (mock)', splatUrl: `/assets/generated/${jobId}.ply` };
        },
    };
}

// ── real (World Labs Marble World API) ──────────────────────────────────────
const API_BASE = 'https://api.worldlabs.ai';

export function worldlabsProvider(apiKey: string, model = process.env.WORLDLABS_MODEL || 'marble-1.1'): WorldProvider {
    return {
        name: `worldlabs(${model})`,
        async start(prompt) {
            const res = await fetch(`${API_BASE}/marble/v1/worlds:generate`, {
                method: 'POST',
                headers: { 'WLT-Api-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: prompt.slice(0, 60) || 'Septopus generated world',
                    model,
                    world_prompt: { type: 'text', text_prompt: prompt },
                }),
            });
            if (!res.ok) throw new Error(`worldlabs generate HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
            const data: any = await res.json();
            const opId = data?.operation_id;
            if (!opId) throw new Error('worldlabs: no operation_id in response');
            return opId;
        },
        async poll(jobId) {
            const res = await fetch(`${API_BASE}/marble/v1/operations/${jobId}`, {
                headers: { 'WLT-Api-Key': apiKey },
            });
            if (!res.ok) throw new Error(`worldlabs poll HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
            const op: any = await res.json();
            if (op.error) return { done: true, error: String(op.error?.message ?? op.error) };
            if (!op.done) {
                return { done: false, status: op.metadata?.progress?.description ?? op.metadata?.progress?.status ?? 'IN_PROGRESS' };
            }
            const world = op.response;
            // Smallest splat variant — a live in-world demo wants a fast load, not
            // the full-res export.
            const spzUrl: string | undefined = world?.assets?.splats?.spz_urls?.['100k']
                ?? world?.assets?.splats?.spz_urls?.full_res;
            if (!spzUrl) return { done: true, error: 'worldlabs: completed with no splat asset' };

            const assetRes = await fetch(spzUrl);
            if (!assetRes.ok) return { done: true, error: `worldlabs: asset download HTTP ${assetRes.status}` };
            const bytes = Buffer.from(await assetRes.arrayBuffer());
            const dest = path.join(GENERATED_DIR, `${jobId}.spz`);
            fs.writeFileSync(dest, bytes);

            return {
                done: true,
                status: 'SUCCEEDED',
                splatUrl: `/assets/generated/${jobId}.spz`,
                thumbnailUrl: world?.assets?.thumbnail_url,
            };
        },
    };
}

export function makeProvider(): WorldProvider {
    const kind = (process.env.WORLDLABS_PROVIDER || 'mock').toLowerCase();
    if (kind === 'real' || kind === 'worldlabs') {
        const key = process.env.WORLDLABS_API_KEY;
        if (!key) throw new Error('WORLDLABS_PROVIDER=real requires WORLDLABS_API_KEY');
        return worldlabsProvider(key);
    }
    return mockProvider();
}
