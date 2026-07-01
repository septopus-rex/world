/**
 * report — the error facade + pluggable-sink registry (error-handling-lib spec
 * §2.1). One call site (`reportError`) fans out to N sinks; producers never know
 * the consumers (console, world.events, metrics…). This is the SLF4J/Sentry
 * shape: call one API, route to many appenders, fully decoupled.
 *
 * Pure core: NO World-instance dependency. A default ConsoleSink is always
 * registered, so errors surface even at boot / in a worker / before any World
 * exists. The world.events path is a `WorldEventSink` a live World installs on
 * top (see WorldEventSink.ts) — it is NOT hardwired here.
 */
import { EngineError, EngineErrorInit } from './EngineError';
import { ConsoleSink } from './ConsoleSink';

export type Severity = 'fatal' | 'error' | 'warn' | 'debug';

export interface ErrorContext extends EngineErrorInit {
    /** Stable prefix, e.g. '[TriggerSystem]' — unifies the ad-hoc console tags. */
    tag: string;
    /** Default 'error'. `attempt` lowers to 'warn'; benign swallows use 'debug'. */
    severity?: Severity;
    /**
     * Opaque World reference. A WorldEventSink emits only for errors of its own
     * world (or with no world set → assumed the single live world). Kept weakly
     * typed so this module never imports World.
     */
    world?: unknown;
}

export interface Sink {
    report(err: EngineError, ctx: ErrorContext): void;
}

// ConsoleSink is registered first and always present (index 0). Additional
// sinks (WorldEventSink, test capture) push after it.
const sinks: Sink[] = [new ConsoleSink()];

/** Register a sink; returns an unsubscribe. World installs a WorldEventSink here. */
export function addSink(sink: Sink): () => void {
    sinks.push(sink);
    return () => {
        const i = sinks.indexOf(sink);
        if (i >= 0) sinks.splice(i, 1);
    };
}

/**
 * Report an error to every sink. Wraps bare values into an EngineError (keeping
 * the original as `cause`) and returns it — callers may rethrow the typed result.
 * A throwing sink never breaks the reporter or the other sinks.
 */
export function reportError(e: unknown, ctx: ErrorContext): EngineError {
    const err = EngineError.from(e, ctx);
    for (const s of [...sinks]) {
        try {
            s.report(err, ctx);
        } catch (sinkErr) {
            // Last resort: a sink must never take down the reporter.
            // eslint-disable-next-line no-console
            console.error('[errors] sink threw while reporting', sinkErr);
        }
    }
    return err;
}

/** Test hook: drop every sink except a fresh ConsoleSink. */
export function resetSinks(): void {
    sinks.length = 0;
    sinks.push(new ConsoleSink());
}
