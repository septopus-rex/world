/**
 * ConsoleSink — the always-on default sink (error-handling-lib spec §2). Turns
 * the ad-hoc `console.warn('[Foo] …')` scatter into one consistent line:
 *   `<tag> [<code>] <message>` + the wrapped cause.
 *
 * Imports TYPES only from report (erased at compile) → no runtime import cycle.
 */
import type { EngineError } from './EngineError';
import type { Sink, ErrorContext, Severity } from './report';

const METHOD: Record<Severity, 'error' | 'warn' | 'debug'> = {
    fatal: 'error',
    error: 'error',
    warn: 'warn',
    debug: 'debug',
};

export class ConsoleSink implements Sink {
    report(err: EngineError, ctx: ErrorContext): void {
        const fn = METHOD[ctx.severity ?? 'error'];
        const line = `${ctx.tag} [${err.code}] ${err.message}`;
        // Surface the original cause when it carried more than the message.
        const cause = err.cause && err.cause !== err ? err.cause : '';
        // eslint-disable-next-line no-console
        (console[fn] as (...a: unknown[]) => void)(line, cause);
    }
}
