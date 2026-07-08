import type { ILiveSource, LiveMessage, LiveStatus } from '@engine/core/services/LiveSource';
import type { WebSocketLike } from './FakeWebSocket';

/**
 * WebSocketLiveSource — the client's ILiveSource over a WebSocket-like socket.
 * Inbound frames are JSON `{ topic, data, ts? }`; the engine never sees the
 * socket, it only poll()s the buffer (drained by LiveSystem each frame into
 * world.events). This is the "real WebSocket implementation stays in the client"
 * half of the live pipeline.
 *
 * Production: construct with `new WebSocket(url)`. Dev / e2e: construct with a
 * FakeWebSocket and use simulateServerMessage() to inject frames deterministically.
 */
export class WebSocketLiveSource implements ILiveSource {
    public readonly kind = 'websocket';
    public status: LiveStatus = 'closed';
    private topics = new Set<string>();
    private buffer: LiveMessage[] = [];

    constructor(private socket: WebSocketLike) {
        if (socket.readyState === 1 /* OPEN */) this.status = 'open';
        socket.onopen = () => { this.status = 'open'; this.flushSubs(); };
        socket.onclose = () => { this.status = 'closed'; };
        socket.onerror = () => { this.status = 'error'; };
        socket.onmessage = (ev) => this.ingest(ev.data);
    }

    private ingest(raw: any): void {
        try {
            const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (msg && typeof msg.topic === 'string' && this.topics.has(msg.topic)) {
                this.buffer.push({ topic: msg.topic, data: msg.data, ts: msg.ts });
            }
        } catch { /* ignore malformed frames */ }
    }

    private flushSubs(): void {
        for (const t of this.topics) this.socket.send(JSON.stringify({ op: 'subscribe', topic: t }));
    }

    subscribe(topic: string): void {
        this.topics.add(topic);
        if (this.status === 'open') this.socket.send(JSON.stringify({ op: 'subscribe', topic }));
    }

    unsubscribe(topic: string): void {
        this.topics.delete(topic);
        if (this.status === 'open') this.socket.send(JSON.stringify({ op: 'unsubscribe', topic }));
    }

    poll(): LiveMessage[] {
        if (this.buffer.length === 0) return [];
        const out = this.buffer;
        this.buffer = [];
        return out;
    }

    send(topic: string, data: unknown): void { this.socket.send(JSON.stringify({ topic, data })); }
    dispose(): void { this.socket.close(); }

    /** Dev / e2e only: deliver a frame as if the server sent it (FakeWebSocket). */
    simulateServerMessage(topic: string, data: unknown, ts?: number): void {
        (this.socket as any).deliver?.(JSON.stringify({ topic, data, ts }));
    }
}
