/**
 * EngineError — the single typed error base for the engine (error-handling-lib
 * spec §5). Pure core: NO Three.js, NO World-instance import — usable at boot,
 * inside a worker, or before any World exists.
 *
 * Two things this buys over bare `new Error(...)`:
 *   1. `code` + subclass type → a catch can DISCRIMINATE expected failures from
 *      real bugs (`ignore(ResourceError, …)`) instead of catch-all swallowing.
 *   2. `cause` preserves the original thrown value (and its stack) when wrapping.
 */

export type ErrorCode =
    | 'RESOURCE_LOAD' | 'RESOURCE_MISSING' | 'RESOURCE_FORMAT'
    | 'ADJUNCT_VALIDATE' | 'ADJUNCT_DESCRIPTOR' | 'ADJUNCT_REGISTRY'
    | 'PROTOCOL_DECODE' | 'PROTOCOL_EXPORT' | 'PROTOCOL_BLOCK'
    | 'PERSIST_IDB'
    | 'PHYSICS_INIT'
    | 'RENDER_CONTEXT'
    | 'CONDITION_EVAL'
    | 'UNKNOWN';

export interface EngineErrorInit {
    code?: ErrorCode;
    /** The original thrown value this error wraps (kept for stack/inspection). */
    cause?: unknown;
    /** Resource-class discriminators (drive the resource.failed event). */
    kind?: string;
    id?: string;
    /** Human-facing text for a toast (vs `.message`, which is dev-facing). */
    userMessage?: string;
}

export class EngineError extends Error {
    readonly code: ErrorCode;
    override readonly cause?: unknown;
    readonly kind?: string;
    readonly id?: string;
    readonly userMessage?: string;

    constructor(message: string, init: EngineErrorInit = {}) {
        super(message);
        // `new.target` is the concrete subclass under construction.
        this.name = new.target.name;
        this.code = init.code ?? 'UNKNOWN';
        this.cause = init.cause;
        this.kind = init.kind;
        this.id = init.id;
        this.userMessage = init.userMessage;
        // Restore the prototype chain: extending built-in Error breaks
        // `instanceof` under down-level transpilation without this.
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Wrap ANY thrown value into an EngineError, preserving the original as
     * `cause`. An already-typed EngineError is returned unchanged (no double
     * wrap, no lost subtype/code).
     */
    static from(e: unknown, init: EngineErrorInit = {}): EngineError {
        if (e instanceof EngineError) return e;
        const message = e instanceof Error ? e.message : String(e);
        return new EngineError(message, { ...init, cause: e });
    }
}

/** Model/texture/audio/cid load + format failures (ResourceManager, ModelLoader, ipfs, AdjunctLoader). */
export class ResourceError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'RESOURCE_LOAD', ...init });
    }
}

/** Dynamic/sandboxed adjunct validation + descriptor + registry failures. */
export class AdjunctError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'ADJUNCT_VALIDATE', ...init });
    }
}

/** SPP codec decode + export/import serialization failures (CollapseCodec, ExportService). */
export class ProtocolError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'PROTOCOL_DECODE', ...init });
    }
}

/** Draft/meta persistence failures (DraftStore, IdbDraftBackend). */
export class PersistenceError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'PERSIST_IDB', ...init });
    }
}

/** Rigid-body physics init/step failures (rapier — Tumble is the first user). */
export class PhysicsError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'PHYSICS_INIT', ...init });
    }
}

/** JSONLogic condition evaluation failure (TriggerSystem, Actuator conditions). */
export class ConditionError extends EngineError {
    constructor(message: string, init: EngineErrorInit = {}) {
        super(message, { code: 'CONDITION_EVAL', ...init });
    }
}
