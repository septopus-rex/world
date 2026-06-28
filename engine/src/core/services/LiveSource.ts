/**
 * ILiveSource — the injected transport for EXTERNAL realtime data
 * (WebSocket / SSE / WebRTC datachannel …). The engine never opens a socket
 * itself: the host (client) implements this interface and owns the connection,
 * reconnection and auth; the engine only consumes normalized messages.
 *
 * PULL, not push. A real socket delivers asynchronously, but the engine must
 * stay deterministic: the transport BUFFERS inbound messages and LiveSystem
 * drains them with poll() at ONE fixed point each frame (mirrors how
 * InputProvider feeds input state). So external data enters the simulation only
 * inside step(), never via an async callback mid-frame — replayable + testable.
 *
 * Same injection pattern as IDataSource / IActuator / IChainPublisher: the
 * default is the inert NullLiveSource; tests use MemoryLiveSource; a real build
 * swaps in a WebSocket-backed implementation (in the CLIENT, not the engine) —
 * zero changes to consumers.
 */
export interface LiveMessage {
    /** Logical channel/room/topic the message belongs to. */
    topic: string;
    /** Already-decoded payload (the transport owns the wire format). */
    data: unknown;
    /** Optional source timestamp (ms). The engine never stamps time itself. */
    ts?: number;
}

export type LiveStatus = 'open' | 'closed' | 'error';

export interface ILiveSource {
    readonly kind: string;
    /** Declare interest in a topic. Idempotent; safe to call before connect. */
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    /** Drain every message buffered since the last call (LiveSystem, per frame).
     *  MUST be non-blocking and return a fresh array. */
    poll(): LiveMessage[];
    /** Optional outbound (client → server). Receive-only transports omit it. */
    send?(topic: string, data: unknown): void;
    /** Connection status snapshot; LiveSystem emits live.status when it changes. */
    readonly status?: LiveStatus;
    dispose?(): void;
}

/**
 * NullLiveSource — inert default so a World without a transport never crashes
 * (parallels NULL_DATA_SOURCE / NullGameApi). Nothing subscribed, nothing polled.
 */
export class NullLiveSource implements ILiveSource {
    public readonly kind = 'null';
    subscribe(): void {}
    unsubscribe(): void {}
    poll(): LiveMessage[] { return []; }
}

/**
 * MemoryLiveSource — in-process mock transport for tests / dev. push() what a
 * server "would" send; poll() drains it FIFO. Honours subscribe(): messages on
 * un-subscribed topics are dropped, modelling real subscription semantics.
 * Deterministic — nothing arrives except what you push.
 */
export class MemoryLiveSource implements ILiveSource {
    public readonly kind = 'memory';
    public status: LiveStatus = 'open';
    private topics = new Set<string>();
    private buffer: LiveMessage[] = [];
    private sent: Array<{ topic: string; data: unknown }> = [];

    subscribe(topic: string): void { this.topics.add(topic); }
    unsubscribe(topic: string): void { this.topics.delete(topic); }

    /** Simulate an inbound server message. Buffered only if its topic is subscribed. */
    public push(topic: string, data: unknown, ts?: number): void {
        if (!this.topics.has(topic)) return;
        this.buffer.push({ topic, data, ts });
    }

    poll(): LiveMessage[] {
        if (this.buffer.length === 0) return [];
        const out = this.buffer;
        this.buffer = [];
        return out;
    }

    send(topic: string, data: unknown): void { this.sent.push({ topic, data }); }
    /** Test introspection: everything send() recorded. */
    public outbox(): ReadonlyArray<{ topic: string; data: unknown }> { return this.sent; }

    public setStatus(s: LiveStatus): void { this.status = s; }
    dispose(): void { this.topics.clear(); this.buffer = []; this.sent = []; }
}
