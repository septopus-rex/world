import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    EngineError, ResourceError, ConditionError,
    reportError, addSink, resetSinks,
    attempt, attemptAsync, retry, ignore,
} from '../../src/core/errors';
import type { Sink, ErrorContext } from '../../src/core/errors';

// The unified error-handling lib (docs/plan/specs/error-handling-lib.md). These
// tests are the anti-regression proof for the WHOLE POINT of the lib — that
// errors are SURFACED, not silently swallowed, and that a discriminating catch
// never hides a real bug. If any of these go red, a hidden-risk hole reopened.

let captured: Array<{ err: EngineError; ctx: ErrorContext }>;
let off: () => void;

beforeEach(() => {
    // Silence the always-on ConsoleSink so intentional error paths don't spam.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    resetSinks();
    captured = [];
    const capture: Sink = { report: (err, ctx) => captured.push({ err, ctx }) };
    off = addSink(capture);
});
afterEach(() => { off(); vi.restoreAllMocks(); });

describe('EngineError', () => {
    it('wraps a bare error, preserving cause + message + code', () => {
        const raw = new TypeError('boom');
        const e = EngineError.from(raw, { code: 'RESOURCE_LOAD' });
        expect(e).toBeInstanceOf(EngineError);
        expect(e.message).toBe('boom');
        expect(e.cause).toBe(raw);
        expect(e.code).toBe('RESOURCE_LOAD');
    });

    it('returns an existing EngineError unchanged (no double-wrap, keeps subtype)', () => {
        const orig = new ResourceError('nope', { id: '7', kind: 'model' });
        expect(EngineError.from(orig)).toBe(orig);
    });

    it('subclasses carry name + default code + a working instanceof chain', () => {
        const e = new ResourceError('x');
        expect(e.name).toBe('ResourceError');
        expect(e.code).toBe('RESOURCE_LOAD');
        expect(e instanceof EngineError).toBe(true);
        expect(e instanceof ResourceError).toBe(true);
        expect(e instanceof ConditionError).toBe(false);
    });
});

describe('reportError — the fan-out facade', () => {
    it('delivers to every registered sink with the context', () => {
        reportError(new Error('a'), { tag: '[T]', severity: 'warn' });
        expect(captured).toHaveLength(1);
        expect(captured[0].ctx.tag).toBe('[T]');
        expect(captured[0].err.message).toBe('a');
    });

    it('a throwing sink never breaks the reporter or the other sinks', () => {
        addSink({ report: () => { throw new Error('sink bug'); } });
        expect(() => reportError(new Error('a'), { tag: '[T]' })).not.toThrow();
        expect(captured).toHaveLength(1); // the good sink still received it
    });
});

describe('attempt — swallow + fallback, but NEVER silent', () => {
    it('returns the fn result on success, reporting nothing', () => {
        const r = attempt({ tag: '[T]' }, () => 42, -1);
        expect(r).toBe(42);
        expect(captured).toHaveLength(0);
    });

    it('reports (default warn) AND returns the fallback on throw', () => {
        const r = attempt({ tag: '[T]' }, () => { throw new Error('bad'); }, -1);
        expect(r).toBe(-1);
        expect(captured).toHaveLength(1);
        expect(captured[0].ctx.severity).toBe('warn');
    });

    it('attemptAsync mirrors it for promises', async () => {
        const r = await attemptAsync({ tag: '[T]' }, async () => { throw new Error('bad'); }, 'fb');
        expect(r).toBe('fb');
        expect(captured).toHaveLength(1);
    });
});

describe('ignore — the catch-all fix (the core hidden-risk guard)', () => {
    it('swallows ONLY the expected type → fallback', () => {
        const r = ignore(ConditionError, () => { throw new ConditionError('bad cond'); }, false);
        expect(r).toBe(false);
    });

    it('RE-THROWS a non-expected error — a real bug is never hidden', () => {
        expect(() => ignore(ConditionError, () => { throw new TypeError('real bug'); }, false))
            .toThrow(TypeError);
    });
});

describe('retry — count/backoff as params, reports on exhaustion', () => {
    it('succeeds within the budget without reporting', async () => {
        let n = 0;
        const r = await retry({ tag: '[T]' }, () => { if (n++ < 2) throw new Error('x'); return 'ok'; }, { tries: 3 });
        expect(r).toBe('ok');
        expect(captured).toHaveLength(0);
    });

    it('reports (severity error) and throws the typed last error on exhaustion', async () => {
        await expect(
            retry({ tag: '[T]', code: 'RESOURCE_LOAD' }, () => { throw new Error('always'); }, { tries: 2 }),
        ).rejects.toBeInstanceOf(EngineError);
        expect(captured).toHaveLength(1);
        expect(captured[0].ctx.severity).toBe('error');
    });
});
