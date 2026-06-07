/**
 * AdjunctSandbox — secure execution sandbox for adjunct code loaded from IPFS/chain.
 * TypeScript migration of the legacy engine/src/septopus/security/adjunct-sandbox.js.
 *
 * Untrusted adjunct code runs in a Web Worker (Blob URL) with dangerous globals
 * shadowed, a static code-pattern filter applied first, and a main-thread timeout
 * that kills runaway code. The worker auto-restarts on crash.
 *
 * TESTABILITY: `validateCode` is a pure static method and is unit-tested in Node.
 * The Worker/Blob-URL execution is browser-only (Node/vitest have no Web Worker +
 * URL.createObjectURL), so timeout/crash-restart are covered by browser E2E, not
 * unit tests. The worker is created lazily so this class can be constructed in Node.
 */

export interface SandboxConfig {
    /** main-thread kill timeout in ms (default 5000) */
    timeout?: number;
}

export interface SandboxExecuteResult {
    hooks: any | null;
}

interface Pending {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
}

/** Patterns rejected before any execution (defense-in-depth; the Worker also strips globals). */
const FORBIDDEN_PATTERNS: RegExp[] = [
    /\beval\s*\(/, /\bnew\s+Function\b/, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/,
    /\bimport\s*\(/, /\brequire\s*\(/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/,
    /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/,
    /\bdocument\s*\./, /\bwindow\s*\./, /\bnavigator\s*\./, /\blocation\s*\./,
    /\bprocess\s*\./, /Object\s*\.\s*prototype\s*\[/, /__proto__/,
];

const MAX_CODE_SIZE = 100 * 1024; // 100KB

export class AdjunctSandbox {
    private worker: Worker | null = null;
    private workerUrl: string | null = null;
    private messageId = 0;
    private pending = new Map<number, Pending>();
    private readonly timeout: number;

    constructor(config: SandboxConfig = {}) {
        this.timeout = config.timeout ?? 5000;
    }

    /**
     * Pure, synchronous code filter — the unit-testable security gate. Throws on a
     * forbidden pattern or oversized code. Runs on the main thread before dispatch.
     */
    static validateCode(code: string): void {
        if (typeof code !== 'string') throw new Error('Adjunct code must be a string');
        if (code.length > MAX_CODE_SIZE) throw new Error(`Adjunct code too large (>${MAX_CODE_SIZE} bytes)`);
        for (const re of FORBIDDEN_PATTERNS) {
            if (re.test(code)) throw new Error(`Forbidden code pattern detected: ${re}`);
        }
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
            throw new Error('AdjunctSandbox execution requires a browser environment (Web Worker + Blob URL).');
        }
        const blob = new Blob([this.workerSource()], { type: 'application/javascript' });
        this.workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = (e) => this.onMessage(e);
        this.worker.onerror = () => this.onError();
        return this.worker;
    }

    /** Source of the in-worker executor: re-validates, shadows globals, returns `hooks`. */
    private workerSource(): string {
        const patterns = JSON.stringify(FORBIDDEN_PATTERNS.map((r) => r.source));
        return `
            const FORBIDDEN = ${patterns}.map((s) => new RegExp(s));
            const sandboxConsole = {
                log: (...a) => postMessage({ type: 'console', level: 'log', args: a }),
                warn: (...a) => postMessage({ type: 'console', level: 'warn', args: a }),
                error: (...a) => postMessage({ type: 'console', level: 'error', args: a }),
            };
            function validate(code) { for (const re of FORBIDDEN) { if (re.test(code)) throw new Error('Forbidden code pattern: ' + re); } }
            onmessage = function (e) {
                const { type, id, code } = e.data;
                try {
                    validate(code);
                    if (type === 'validate') { new Function(code); postMessage({ type: 'ok', id, result: null }); return; }
                    const fn = new Function('console', 'Math', 'JSON', 'Object', 'Array',
                        '"use strict"; const window=undefined,document=undefined,globalThis=undefined,self=undefined,fetch=undefined;' +
                        code + '; return (typeof hooks !== "undefined") ? hooks : null;');
                    const result = fn(sandboxConsole, Math, JSON, Object, Array);
                    postMessage({ type: 'ok', id, result });
                } catch (err) {
                    postMessage({ type: 'err', id, error: String((err && err.message) || err) });
                }
            };
        `;
    }

    private onMessage(e: MessageEvent): void {
        const { type, id, result, error, level, args } = (e.data || {}) as any;
        if (type === 'console') { (console as any)[level]?.('[AdjunctSandbox]', ...(args || [])); return; }
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (type === 'ok') p.resolve(result);
        else p.reject(new Error(error || 'sandbox error'));
    }

    private onError(): void {
        for (const [, p] of this.pending) p.reject(new Error('Sandbox worker crashed'));
        this.pending.clear();
        this.restart();
    }

    private send(type: 'execute' | 'validate', code: string): Promise<any> {
        AdjunctSandbox.validateCode(code); // fail fast on the main thread
        const worker = this.ensureWorker();
        const id = ++this.messageId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Adjunct execution timeout'));
            }, this.timeout);
            this.pending.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            worker.postMessage({ type, id, code });
        });
    }

    /** Execute adjunct code and return its `hooks` export (browser-only). */
    executeAdjunct(code: string): Promise<SandboxExecuteResult> {
        return this.send('execute', code).then((hooks) => ({ hooks }));
    }

    /** Validate (filter + syntax check) without keeping results (browser-only). */
    validate(code: string): Promise<void> {
        return this.send('validate', code).then(() => undefined);
    }

    restart(): void { this.destroy(); }

    destroy(): void {
        if (this.worker) { this.worker.terminate(); this.worker = null; }
        if (this.workerUrl) { URL.revokeObjectURL(this.workerUrl); this.workerUrl = null; }
        this.pending.clear();
    }
}
