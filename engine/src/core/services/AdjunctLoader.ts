import { AdjunctSandbox } from './AdjunctSandbox';
import { retry, attemptAsync, reportError } from '../errors';

/**
 * AdjunctLoader — dynamic loader for adjunct code from IPFS (and, later, chain).
 * TypeScript migration of the legacy engine/src/septopus/security/adjunct-loader.js.
 *
 * Loads code → validates/executes it inside AdjunctSandbox → caches the resulting
 * hooks. A concurrency gate (maxConcurrent) bounds parallel loads.
 *
 * STATUS: not wired into the live render path yet — dynamic/chain-loaded adjuncts
 * are gated with chain integration (deprioritized). Network fetch + sandbox
 * execution are browser-only; cache/concurrency logic is plain and Node-testable.
 */

export interface AdjunctLoaderConfig {
    ipfsGateway?: string;
    retryCount?: number;
    timeout?: number;
    maxConcurrent?: number;
    maxCodeSize?: number;
}

export class AdjunctLoader {
    private sandbox: AdjunctSandbox;
    private cache = new Map<string, any>();
    private readonly ipfsGateway: string;
    private readonly retryCount: number;
    private readonly timeout: number;
    private readonly maxConcurrent: number;
    private readonly maxCodeSize: number;

    private active = 0;
    private queue: Array<() => void> = [];

    constructor(config: AdjunctLoaderConfig = {}) {
        this.sandbox = new AdjunctSandbox({ timeout: config.timeout });
        this.ipfsGateway = config.ipfsGateway ?? 'https://gateway.pinata.cloud/ipfs/';
        this.retryCount = config.retryCount ?? 3;
        this.timeout = config.timeout ?? 10000;
        this.maxConcurrent = config.maxConcurrent ?? 3;
        this.maxCodeSize = config.maxCodeSize ?? 100 * 1024;
    }

    /** Load adjunct hooks from an IPFS CID (cached). Browser-only (fetch + Worker). */
    async loadFromIPFS(cid: string, codeHash?: string): Promise<any> {
        const key = `ipfs:${cid}`;
        if (this.cache.has(key)) return this.cache.get(key);

        return this.withSlot(async () => {
            const code = await this.fetchFromIPFS(cid);
            if (codeHash && !(await this.verifyCodeHash(code, codeHash))) {
                throw new Error('Code hash verification failed');
            }
            await this.sandbox.validate(code);
            const { hooks } = await this.sandbox.executeAdjunct(code);
            this.cache.set(key, hooks);
            return hooks;
        });
    }

    /**
     * Execute a LOCAL code string in the sandbox and return its `hooks` (no
     * network). The transport-free path for injected / dev adjuncts and tests:
     * the IPFS fetch in loadFromIPFS is decoupled from sandbox execution, so the
     * code here is exactly what runs once a CID resolves. Browser-only (Worker).
     */
    async loadFromCode(code: string): Promise<any> {
        await this.sandbox.validate(code);
        const { hooks } = await this.sandbox.executeAdjunct(code);
        return hooks;
    }

    /** Chain-stored adjunct code — deferred with chain integration (0C). */
    async loadFromChain(_contractAddress: string, _adjunctId: string | number): Promise<any> {
        throw new Error('Chain-based adjunct loading not implemented (deferred with chain integration).');
    }

    private async fetchFromIPFS(cid: string): Promise<string> {
        // retryCount / backoff are parameters now, not an inline loop; on
        // exhaustion `retry` reports (severity 'error') and throws the typed
        // last error. See core/errors §6.
        return retry(
            { tag: '[AdjunctLoader]', code: 'RESOURCE_LOAD', kind: 'cid', id: cid },
            async () => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), this.timeout);
                try {
                    const res = await fetch(`${this.ipfsGateway}${cid}`, {
                        signal: controller.signal,
                        headers: { Accept: 'text/javascript, application/javascript' },
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    const code = await res.text();
                    if (code.length > this.maxCodeSize) throw new Error(`Code too large: ${code.length} bytes`);
                    return code;
                } finally {
                    clearTimeout(timer);
                }
            },
            { tries: this.retryCount, backoffMs: 1000 },
        );
    }

    async verifyCodeHash(code: string, expectedHash: string): Promise<boolean> {
        // Safe default false (verification failed) on a crypto error — now
        // reported instead of silently swallowed.
        return attemptAsync(
            { tag: '[AdjunctLoader]', severity: 'warn', code: 'ADJUNCT_VALIDATE' },
            async () => {
                const data = new TextEncoder().encode(code);
                const buf = await crypto.subtle.digest('SHA-256', data);
                const actual = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
                return actual === expectedHash;
            },
            false,
        );
    }

    async preload(list: Array<{ ipfsHash?: string; codeHash?: string; name?: string }>): Promise<void> {
        await Promise.allSettled(
            list.map(async (a) => {
                if (!a.ipfsHash) return;
                try { await this.loadFromIPFS(a.ipfsHash, a.codeHash); }
                catch (e) { reportError(e, { tag: '[AdjunctLoader]', severity: 'debug', code: 'RESOURCE_LOAD', kind: 'cid', id: a.name ?? a.ipfsHash }); }
            }),
        );
    }

    clearCache(): void { this.cache.clear(); }

    getCacheStats(): { size: number; keys: string[] } {
        return { size: this.cache.size, keys: Array.from(this.cache.keys()) };
    }

    destroy(): void {
        this.sandbox.destroy();
        this.clearCache();
    }

    /** Concurrency gate: at most `maxConcurrent` loads run at once. */
    private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            await new Promise<void>((resolve) => this.queue.push(resolve));
        }
        this.active++;
        try {
            return await fn();
        } finally {
            this.active--;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}
