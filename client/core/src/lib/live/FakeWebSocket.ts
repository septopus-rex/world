/**
 * FakeWebSocket — a minimal, API-compatible stand-in for the browser WebSocket,
 * enough for WebSocketLiveSource. No network: it "opens" immediately and the
 * server side is simulated by deliver(). Swap `new FakeWebSocket()` for
 * `new WebSocket(url)` to go live — WebSocketLiveSource needs no changes.
 */
export interface WebSocketLike {
    readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((ev?: any) => void) | null;
    onmessage: ((ev: { data: any }) => void) | null;
    onclose: ((ev?: any) => void) | null;
    onerror: ((ev?: any) => void) | null;
}

export class FakeWebSocket implements WebSocketLike {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    public readyState = FakeWebSocket.OPEN; // no handshake — open at once
    public onopen: ((ev?: any) => void) | null = null;
    public onmessage: ((ev: { data: any }) => void) | null = null;
    public onclose: ((ev?: any) => void) | null = null;
    public onerror: ((ev?: any) => void) | null = null;
    /** Everything the client sent (test introspection). */
    public readonly sent: string[] = [];

    send(data: string): void { this.sent.push(data); }
    close(): void { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }

    /** Simulate the SERVER pushing a frame to this client. */
    deliver(raw: string): void { this.onmessage?.({ data: raw }); }
}
