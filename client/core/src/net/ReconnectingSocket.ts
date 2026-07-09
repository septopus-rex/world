import type { WebSocketLike } from '../lib/live/FakeWebSocket';

/**
 * ReconnectingSocket — a managed WebSocket with the lifecycle a real deployment
 * needs, behind the same `WebSocketLike` surface the live pipeline already
 * consumes (WebSocketLiveSource needs zero changes):
 *
 *   · auto-reconnect with exponential backoff (0.5s → 8s cap, jittered)
 *   · heartbeat (`{op:'ping'}` every 20s while open; servers may ignore it)
 *   · re-fires `onopen` on every reconnect — the live source re-subscribes its
 *     topics there, so subscriptions survive a drop for free
 *   · clean close(): stops reconnecting, releases timers — disposal is final
 *
 * Frames queued while disconnected are dropped (live data is ephemeral by
 * definition; requests belong on HttpChannel, not here).
 */
export class ReconnectingSocket implements WebSocketLike {
    public readyState = 0; // CONNECTING
    public onopen: ((ev?: any) => void) | null = null;
    public onmessage: ((ev: { data: any }) => void) | null = null;
    public onclose: ((ev?: any) => void) | null = null;
    public onerror: ((ev?: any) => void) | null = null;

    private ws: WebSocket | null = null;
    private attempts = 0;
    private closed = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly url: string,
        private readonly opts: { heartbeatMs?: number; maxBackoffMs?: number } = {},
    ) {
        this.dial();
    }

    private dial(): void {
        if (this.closed) return;
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            this.onerror?.(e);
            this.scheduleReconnect();
            return;
        }
        this.readyState = 0;
        this.ws.onopen = () => {
            this.attempts = 0;
            this.readyState = 1; // OPEN
            this.startHeartbeat();
            this.onopen?.(); // live source re-subscribes here
        };
        this.ws.onmessage = (ev) => this.onmessage?.({ data: ev.data });
        this.ws.onerror = (ev) => {
            this.onerror?.(ev);
            // Some runtimes (Node/undici) fire `error` WITHOUT a following
            // `close` on a refused dial (browsers fire both) — treat any
            // pre-open error as a drop so the reconnect still happens.
            // Idempotent: scheduleReconnect no-ops if `close` also arrives.
            if (this.readyState !== 1) {
                this.discard(this.ws);
                this.ws = null;
                this.stopHeartbeat();
                this.readyState = 3;
                if (!this.closed) this.scheduleReconnect();
            }
        };
        this.ws.onclose = () => {
            this.stopHeartbeat();
            this.readyState = 3; // CLOSED
            // ALWAYS forward the close — consumers get the truthful status
            // (a HUD can show "reconnecting"); on the reopen, onopen flips them
            // back and re-subscription runs. Transient and final look the same
            // to the consumer; finality is this class's own concern.
            this.onclose?.();
            if (!this.closed) this.scheduleReconnect();
        };
    }

    /** Detach a dead/half-open socket completely: noop handlers (so late
     *  events from the doomed dial can't re-enter our logic or surface as
     *  unhandled) + best-effort close. */
    private discard(ws: WebSocket | null): void {
        if (!ws) return;
        const noop = () => { /* zombie events die here */ };
        ws.onopen = noop; ws.onmessage = noop; ws.onerror = noop; ws.onclose = noop;
        try { ws.close(); } catch { /* half-open */ }
    }

    private scheduleReconnect(): void {
        if (this.closed || this.reconnectTimer) return;
        const cap = this.opts.maxBackoffMs ?? 8000;
        const delay = Math.min(cap, 500 * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
        this.attempts++;
        console.log(`[net] ws ${this.url} down — reconnect #${this.attempts} in ${Math.round(delay)}ms`);
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.dial(); }, delay);
    }

    private startHeartbeat(): void {
        const ms = this.opts.heartbeatMs ?? 20_000;
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.readyState === 1) { try { this.ws?.send(JSON.stringify({ op: 'ping' })); } catch { /* drop */ } }
        }, ms);
    }
    private stopHeartbeat(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    send(data: string): void {
        if (this.readyState === 1) this.ws?.send(data);
        // else: dropped — live frames are ephemeral; the reopen re-subscribe restores state
    }

    close(): void {
        this.closed = true;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.stopHeartbeat();
        this.readyState = 3;
        try { this.ws?.close(); } catch { /* already down */ }
    }
}
