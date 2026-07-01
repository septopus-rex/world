/**
 * attempt / retry / ignore — the decision helpers (error-handling-lib spec §6).
 *
 * They unify the MECHANISM + reporting, not the POLICY: the fallback value, the
 * retry count and the expected type are passed IN by the call site — the helper
 * only guarantees the shape (report once, no silent swallow, discriminate real
 * bugs). `try/catch` control flow is not replaced; these just make it consistent.
 */
import { reportError, ErrorContext } from './report';

/**
 * Run `fn`; on ANY throw, report (default severity 'warn') and return `fallback`.
 * Replaces "swallow → fallback" catches — the key difference from `catch { … }`
 * is it can NEVER be truly silent: every fallback leaves a trace.
 */
export function attempt<T>(ctx: ErrorContext, fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch (e) {
        reportError(e, { severity: 'warn', ...ctx });
        return fallback;
    }
}

/** Async form of {@link attempt}. */
export async function attemptAsync<T>(
    ctx: ErrorContext,
    fn: () => Promise<T> | T,
    fallback: T,
): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        reportError(e, { severity: 'warn', ...ctx });
        return fallback;
    }
}

export interface RetryOpts {
    tries: number;
    /** Linear backoff: wait `backoffMs * attemptIndex` before each retry. */
    backoffMs?: number;
}

/**
 * Run `fn` up to `opts.tries` times. On exhaustion, report (severity 'error')
 * and THROW the typed last error. Replaces AdjunctLoader's hand-rolled loop —
 * the count/backoff are parameters now, not inline magic numbers.
 */
export async function retry<T>(
    ctx: ErrorContext,
    fn: (attemptIndex: number) => Promise<T> | T,
    opts: RetryOpts,
): Promise<T> {
    let last: unknown;
    for (let i = 0; i < opts.tries; i++) {
        try {
            return await fn(i);
        } catch (e) {
            last = e;
            if (opts.backoffMs && i < opts.tries - 1) {
                await new Promise((r) => setTimeout(r, opts.backoffMs! * (i + 1)));
            }
        }
    }
    throw reportError(last, { severity: 'error', ...ctx });
}

type ErrCtor = new (...args: never[]) => Error;

/**
 * Run `fn`; swallow ONLY when the throw is `instanceof expected`, returning
 * `fallback`. Anything else (a real bug) is RE-THROWN. This is the fix for
 * catch-all swallowing: `catch (e) { return fallback }` hides genuine errors;
 * `ignore(ExpectedError, …)` only hides the one you meant to.
 */
export function ignore<T>(expected: ErrCtor, fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch (e) {
        if (e instanceof expected) return fallback;
        throw e;
    }
}
