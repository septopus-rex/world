/**
 * WorldEventSink — the binding layer that pushes reported errors onto a specific
 * World's frame-scoped event queue (error-handling-lib spec §2.2). A live World
 * installs one via `addSink(...)` on construction and removes it on dispose.
 *
 * This is how "errors go to world.events" without the pure facade importing
 * World: the sink is HANDED the queue; the facade stays World-free (so boot /
 * worker / rapier-init errors still reach ConsoleSink with no world alive).
 *
 * It revives two previously-dead channels: `resource.failed` (defined but never
 * emitted) for model/texture load failures, and the new general `engine.error`.
 */
import type { EngineError } from './EngineError';
import type { Sink, ErrorContext } from './report';
import type { EventQueue } from '../events/EventQueue';

export class WorldEventSink implements Sink {
    /**
     * @param events   the World's event queue (emit target)
     * @param worldRef identity token — emit only for errors of THIS world (or
     *                 errors with no world set, i.e. the single-world common case)
     */
    constructor(private readonly events: EventQueue, private readonly worldRef: unknown) {}

    report(err: EngineError, ctx: ErrorContext): void {
        // In a (rare) multi-world setup, don't cross-emit another world's errors.
        if (ctx.world && ctx.world !== this.worldRef) return;

        // Resource-class failures also light up the dedicated resource.failed
        // channel (kind is constrained to the model/texture union it declares).
        if (err.kind === 'model' || err.kind === 'texture') {
            this.events.emit('resource.failed', { kind: err.kind, id: err.id ?? '', error: err.message });
        }

        this.events.emit('engine.error', {
            code: err.code,
            severity: ctx.severity ?? 'error',
            message: err.message,
            userMessage: err.userMessage,
            kind: err.kind,
            id: err.id,
        });
    }
}
