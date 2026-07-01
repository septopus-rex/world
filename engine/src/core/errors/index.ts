/**
 * core/errors — the unified error-handling lib (spec: docs/plan/specs/error-handling-lib.md).
 *
 *   reportError(e, { tag, severity })   — the facade; fans out to sinks
 *   attempt / attemptAsync / retry      — swallow+fallback / retry (mechanism, not policy)
 *   ignore(ExpectedError, fn, fb)       — discriminating catch (rethrows real bugs)
 *   EngineError + subclasses            — typed errors with code + cause
 *   WorldEventSink                      — the world.events binding (World installs it)
 *
 * Pure core: no Three.js, no World-instance import.
 */
export {
    EngineError,
    ResourceError,
    AdjunctError,
    ProtocolError,
    PersistenceError,
    PhysicsError,
    ConditionError,
} from './EngineError';
export type { ErrorCode, EngineErrorInit } from './EngineError';

export { reportError, addSink, resetSinks } from './report';
export type { Sink, Severity, ErrorContext } from './report';

export { ConsoleSink } from './ConsoleSink';
export { WorldEventSink } from './WorldEventSink';

export { attempt, attemptAsync, retry, ignore } from './attempt';
export type { RetryOpts } from './attempt';
