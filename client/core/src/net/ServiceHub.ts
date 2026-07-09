import { HttpChannel, type ChannelStatus } from './HttpChannel';
import { ReconnectingSocket } from './ReconnectingSocket';

/**
 * ServiceHub — THE single place the client manages its external connections.
 *
 * Every companion service (game 7787 · board 7786 · ipfs 7789 · ai 7788 · a
 * future live WS) is registered here once; consumers ask the hub for a channel
 * instead of hand-rolling fetch/probe/reconnect at the call site. What the hub
 * centralizes:
 *
 *   · endpoint registry (name → base URL), env-overridable per deployment —
 *     in the on-chain world these bases come from world-config data
 *   · uniform HTTP policy (probe/timeout/status) via HttpChannel
 *   · managed WebSockets (backoff reconnect/heartbeat/clean close) via
 *     ReconnectingSocket
 *   · one status map + change events — a HUD/debug panel or an e2e can watch
 *     every service from here
 *   · closeAll(): deterministic teardown (page unload, world switch)
 *
 * Offline-first discipline: a channel being 'offline' is a legal state, never
 * an exception — each consumer declares its own degradation (game → in-page
 * loopback, board → read-only, CAS → local tiers).
 */
export class ServiceHub {
    private channels = new Map<string, HttpChannel>();
    private sockets = new Set<ReconnectingSocket>();
    private listeners = new Set<(name: string, status: ChannelStatus) => void>();

    /** Register (or re-register) an HTTP service endpoint. */
    register(name: string, base: string, probePath = '/v0/health'): HttpChannel {
        const ch = new HttpChannel(base, probePath);
        ch.onStatus((s) => { for (const cb of this.listeners) cb(name, s); });
        this.channels.set(name, ch);
        return ch;
    }

    /** The channel for a registered service (throws on unknown — registration is explicit). */
    http(name: string): HttpChannel {
        const ch = this.channels.get(name);
        if (!ch) throw new Error(`[net] unknown service "${name}" — register it on the hub first`);
        return ch;
    }
    has(name: string): boolean { return this.channels.has(name); }

    /** A one-off channel for a data-declared base URL (e.g. a Game Setting's
     *  own `baseurl`) — same policy, not in the registry. */
    adhoc(base: string, probePath = '/v0/health'): HttpChannel {
        return new HttpChannel(base, probePath);
    }

    /** Open a managed WebSocket (owned by the hub; closeAll() tears it down). */
    socket(url: string, opts?: { heartbeatMs?: number; maxBackoffMs?: number }): ReconnectingSocket {
        const s = new ReconnectingSocket(url, opts);
        this.sockets.add(s);
        return s;
    }

    /** Snapshot of every registered service's status (HUD / debug / e2e). */
    statuses(): Record<string, ChannelStatus> {
        const out: Record<string, ChannelStatus> = {};
        for (const [name, ch] of this.channels) out[name] = ch.status;
        return out;
    }
    onStatus(cb: (name: string, status: ChannelStatus) => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    /** Deterministic teardown: close every managed socket. HTTP channels are
     *  stateless (per-request AbortSignals), nothing to release there. */
    closeAll(): void {
        for (const s of this.sockets) s.close();
        this.sockets.clear();
    }
}
