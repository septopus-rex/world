/**
 * HttpChannel — one HTTP(S) service endpoint with a uniform connection policy.
 *
 * Every scattered `fetch` to a companion service (game/board/ipfs/ai …) goes
 * through one of these instead of hand-rolling probe/timeout/abort per call
 * site. Policy in ONE place:
 *   · probe(): quiet health check, cached until reprobe() — offline is a legal
 *     state (local-first), never an exception.
 *   · JSON + raw-bytes verbs with per-call timeout; network failure marks the
 *     channel offline and rejects — callers decide their degradation.
 *   · status surface ('unknown' | 'online' | 'offline') + change callbacks,
 *     so a HUD/debug panel can watch every service from one map.
 */
export type ChannelStatus = 'unknown' | 'online' | 'offline';

export interface RequestOpts {
    timeoutMs?: number;          // default 3000
    headers?: Record<string, string>;
}

export class HttpChannel {
    private _status: ChannelStatus = 'unknown';
    private probePromise: Promise<boolean> | null = null;
    private listeners = new Set<(s: ChannelStatus) => void>();

    constructor(
        public readonly base: string,
        private readonly probePath: string = '/v0/health',
    ) {}

    get status(): ChannelStatus { return this._status; }
    onStatus(cb: (s: ChannelStatus) => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    private setStatus(s: ChannelStatus): void {
        if (this._status === s) return;
        this._status = s;
        for (const cb of this.listeners) cb(s);
    }

    /** Quiet reachability probe — cached; an absent service costs one attempt. */
    probe(timeoutMs = 800): Promise<boolean> {
        if (!this.probePromise) {
            this.probePromise = fetch(this.base + this.probePath, { signal: AbortSignal.timeout(timeoutMs) })
                .then(async (r) => r.ok && (await r.json())?.ok === true)
                .catch(() => false)
                .then((ok) => { this.setStatus(ok ? 'online' : 'offline'); return ok; });
        }
        return this.probePromise;
    }
    /** Drop the cached probe (e.g. a HUD "retry" button); next probe() re-checks. */
    reprobe(): Promise<boolean> { this.probePromise = null; return this.probe(); }

    private async run(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
        try {
            const res = await fetch(this.base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
            this.setStatus('online'); // any HTTP answer = the service is there
            return res;
        } catch (e) {
            this.setStatus('offline'); // network-level failure only
            throw e;
        }
    }

    /** GET returning parsed JSON; throws on network error or non-2xx. */
    async getJson(path: string, opts: RequestOpts = {}): Promise<any> {
        const res = await this.run(path, { headers: opts.headers }, opts.timeoutMs ?? 3000);
        if (!res.ok) throw new Error(`[net] GET ${this.base}${path} → ${res.status} ${res.statusText}`);
        return res.json();
    }

    /** POST a JSON body, returning parsed JSON; throws on network error or non-2xx. */
    async postJson(path: string, body: unknown, opts: RequestOpts = {}): Promise<any> {
        const res = await this.run(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...opts.headers },
            body: JSON.stringify(body),
        }, opts.timeoutMs ?? 3000);
        if (!res.ok) throw new Error(`[net] POST ${this.base}${path} → ${res.status} ${res.statusText}`);
        return res.json();
    }

    /** POST JSON, returning `{ok, status, data}` — the body is parsed even on
     *  non-2xx (services that put diagnostics in an error payload, e.g. the AI
     *  gateway's validate-and-return-errors contract). Throws only on network. */
    async postJsonFull(path: string, body: unknown, opts: RequestOpts = {}): Promise<{ ok: boolean; status: number; data: any }> {
        const res = await this.run(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...opts.headers },
            body: JSON.stringify(body),
        }, opts.timeoutMs ?? 3000);
        let data: any = null;
        try { data = await res.json(); } catch { /* non-JSON error body */ }
        return { ok: res.ok, status: res.status, data };
    }

    /** GET raw bytes, or null on miss/failure (CAS-style fallthrough). */
    async getBytes(path: string, opts: RequestOpts = {}): Promise<Uint8Array | null> {
        try {
            const res = await this.run(path, { headers: opts.headers }, opts.timeoutMs ?? 5000);
            if (!res.ok) return null;
            return new Uint8Array(await res.arrayBuffer());
        } catch { return null; }
    }

    /** POST raw bytes, returning parsed JSON; throws on network error or non-2xx. */
    async postBytes(path: string, bytes: Uint8Array, contentType = 'application/octet-stream', opts: RequestOpts = {}): Promise<any> {
        const res = await this.run(path, {
            method: 'POST',
            headers: { 'content-type': contentType, ...opts.headers },
            body: bytes as unknown as BodyInit,
        }, opts.timeoutMs ?? 8000);
        if (!res.ok) throw new Error(`[net] POST ${this.base}${path} → ${res.status} ${res.statusText}`);
        return res.json();
    }
}
