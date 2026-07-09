import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpChannel } from '../../../client/core/src/net/HttpChannel';
import { ReconnectingSocket } from '../../../client/core/src/net/ReconnectingSocket';
import { ServiceHub } from '../../../client/core/src/net/ServiceHub';
import { WebSocketLiveSource } from '../../../client/core/src/lib/live/WebSocketLiveSource';

// FULL lifecycle tests for the client's connection module (client/core/src/net)
// — the infrastructure every companion service rides, so the extremes are the
// point: dead servers, mid-flight drops, reconnect storms, close() races.
// The module's engine imports are type-only, so the engine's vitest runs it
// without any alias config (same cross-package precedent as the level JSONs).

/* ────────────────────────── HttpChannel ────────────────────────── */

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('HttpChannel — probe / policy / status lifecycle', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('probe caches its result (one wire hit for N callers); reprobe re-checks', async () => {
        const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
        vi.stubGlobal('fetch', fetchSpy);
        const ch = new HttpChannel('http://x');
        expect(await Promise.all([ch.probe(), ch.probe(), ch.probe()])).toEqual([true, true, true]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(ch.status).toBe('online');
        await ch.reprobe();
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('probe: network error / non-ok / {ok:false} all → false + offline, never throws', async () => {
        for (const impl of [
            async () => { throw new TypeError('ECONNREFUSED'); },
            async () => new Response('nope', { status: 503 }),
            async () => jsonResponse({ ok: false }),
        ]) {
            vi.stubGlobal('fetch', vi.fn(impl as any));
            const ch = new HttpChannel('http://dead');
            expect(await ch.probe()).toBe(false);
            expect(ch.status).toBe('offline');
        }
    });

    it('probe timeout: a hanging server flips to offline within the probe budget', async () => {
        vi.stubGlobal('fetch', vi.fn((_url: any, init: any) => new Promise((_res, rej) => {
            init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        })));
        const ch = new HttpChannel('http://slow');
        const t0 = Date.now();
        expect(await ch.probe(80)).toBe(false);
        expect(Date.now() - t0).toBeLessThan(1000);
        expect(ch.status).toBe('offline');
    });

    it('getJson/postJson: success parses; non-2xx throws named error; network error marks offline', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ hello: 1 })));
        const ch = new HttpChannel('http://x');
        expect(await ch.getJson('/v0/a')).toEqual({ hello: 1 });
        expect(ch.status).toBe('online');

        vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404, statusText: 'Not Found' })));
        await expect(ch.getJson('/v0/miss')).rejects.toThrow(/404/);
        expect(ch.status, 'an HTTP answer still means the service is there').toBe('online');

        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
        await expect(ch.postJson('/v0/b', { x: 1 })).rejects.toThrow();
        expect(ch.status).toBe('offline');
    });

    it('postJsonFull: non-2xx still yields the parsed diagnostic body (AI-gateway contract)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: '预算超限' }, 422)));
        const ch = new HttpChannel('http://ai');
        const r = await ch.postJsonFull('/v0/generate', { prompt: 'x' });
        expect(r).toMatchObject({ ok: false, status: 422, data: { error: '预算超限' } });

        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>boom</html>', { status: 500 })));
        const r2 = await ch.postJsonFull('/v0/generate', {});
        expect(r2).toMatchObject({ ok: false, status: 500, data: null }); // non-JSON body degrades to null
    });

    it('getBytes NEVER throws: miss and network error both → null (CAS fallthrough)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
        const ch = new HttpChannel('http://cas');
        expect(await ch.getBytes('/ipfs/bafk404')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('reset'); }));
        expect(await ch.getBytes('/ipfs/bafkdead')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
        expect([...(await ch.getBytes('/ipfs/bafkok'))!]).toEqual([1, 2, 3]);
    });

    it('status events: fire on change only, with unsubscribe', async () => {
        const seen: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
        const ch = new HttpChannel('http://x');
        const off = ch.onStatus((s) => seen.push(s));
        await ch.probe();
        await ch.getJson('/v0/a');            // already online — no duplicate event
        expect(seen).toEqual(['online']);
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down'); }));
        await ch.getJson('/v0/a').catch(() => {});
        expect(seen).toEqual(['online', 'offline']);
        off();
        await ch.reprobe();                    // back online, but unsubscribed
        expect(seen).toEqual(['online', 'offline']);
    });
});

/* ─────────────────────── ReconnectingSocket ─────────────────────── */

/** A controllable stand-in for the browser WebSocket: tests drive open/close/
 *  message/error explicitly; every construction is recorded. */
class MockWS {
    static instances: MockWS[] = [];
    static failConstructor = false;
    readyState = 0;
    sent: string[] = [];
    onopen: ((ev?: any) => void) | null = null;
    onmessage: ((ev: { data: any }) => void) | null = null;
    onclose: ((ev?: any) => void) | null = null;
    onerror: ((ev?: any) => void) | null = null;
    constructor(public url: string) {
        if (MockWS.failConstructor) throw new Error('dial refused');
        MockWS.instances.push(this);
    }
    send(data: string): void { this.sent.push(data); }
    close(): void { this.readyState = 3; this.onclose?.(); }
    // test controls:
    serverOpen(): void { this.readyState = 1; this.onopen?.(); }
    serverDrop(): void { this.readyState = 3; this.onclose?.(); }
    serverSend(data: string): void { this.onmessage?.({ data }); }
}

describe('ReconnectingSocket — disconnect extremes', () => {
    beforeEach(() => {
        MockWS.instances = [];
        MockWS.failConstructor = false;
        vi.useFakeTimers();
        vi.stubGlobal('WebSocket', MockWS as any);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('opens, then AUTO-RECONNECTS on a server drop, re-firing onopen (resubscribe seam)', () => {
        const opens: number[] = [];
        const s = new ReconnectingSocket('ws://live');
        s.onopen = () => opens.push(Date.now());
        expect(MockWS.instances).toHaveLength(1);
        MockWS.instances[0].serverOpen();
        expect(s.readyState).toBe(1);
        expect(opens).toHaveLength(1);

        MockWS.instances[0].serverDrop();          // mid-flight disconnect
        expect(s.readyState).toBe(3);
        vi.advanceTimersByTime(1000);              // ≥ max first backoff (500×1.25)
        expect(MockWS.instances, 'a second dial happened').toHaveLength(2);
        MockWS.instances[1].serverOpen();
        expect(opens, 'onopen re-fired → live source re-subscribes').toHaveLength(2);
        s.close();
    });

    it('server never up: keeps retrying with growing, CAPPED backoff — until close() ends it', () => {
        MockWS.failConstructor = true;             // every dial throws
        const s = new ReconnectingSocket('ws://void', { maxBackoffMs: 8000 });
        // constructor dial failed → schedule #1; run a storm of rounds:
        for (let i = 0; i < 10; i++) vi.advanceTimersByTime(10_001); // > cap×1.25
        const dialsBeforeClose = vi.getTimerCount();
        expect(dialsBeforeClose, 'a reconnect is always pending while down').toBeGreaterThan(0);

        s.close();                                  // finality
        vi.advanceTimersByTime(60_000);
        expect(vi.getTimerCount(), 'close() cancels the pending dial + timers').toBe(0);
    });

    it('close() during the backoff wait cancels the pending dial (no zombie reconnects)', () => {
        const s = new ReconnectingSocket('ws://live');
        MockWS.instances[0].serverOpen();
        MockWS.instances[0].serverDrop();
        s.close();                                  // race: close while reconnect is scheduled
        vi.advanceTimersByTime(60_000);
        expect(MockWS.instances, 'no dial after close').toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('heartbeat pings while open, stops on drop, resumes on reconnect', () => {
        const s = new ReconnectingSocket('ws://live', { heartbeatMs: 1000 });
        MockWS.instances[0].serverOpen();
        vi.advanceTimersByTime(3000);
        const pings = MockWS.instances[0].sent.filter((f) => JSON.parse(f).op === 'ping');
        expect(pings.length).toBe(3);

        MockWS.instances[0].serverDrop();
        const sentAtDrop = MockWS.instances[0].sent.length;
        vi.advanceTimersByTime(5000);               // reconnects during this window
        expect(MockWS.instances[0].sent.length, 'no pings into a dead socket').toBe(sentAtDrop);

        MockWS.instances[1].serverOpen();
        vi.advanceTimersByTime(2000);
        expect(MockWS.instances[1].sent.filter((f) => JSON.parse(f).op === 'ping').length).toBe(2);
        s.close();
    });

    it('send while disconnected is dropped silently (live frames are ephemeral)', () => {
        const s = new ReconnectingSocket('ws://live');
        expect(() => s.send('early')).not.toThrow();   // still CONNECTING
        MockWS.instances[0].serverOpen();
        s.send('hello');
        MockWS.instances[0].serverDrop();
        expect(() => s.send('into the void')).not.toThrow();
        expect(MockWS.instances[0].sent).toEqual(['hello']);
        s.close();
    });

    it('messages flow through; a frame arriving around a drop never crashes', () => {
        const got: any[] = [];
        const s = new ReconnectingSocket('ws://live');
        s.onmessage = (ev) => got.push(ev.data);
        MockWS.instances[0].serverOpen();
        MockWS.instances[0].serverSend('a');
        MockWS.instances[0].serverDrop();
        expect(() => MockWS.instances[0].serverSend('late')).not.toThrow();
        expect(got).toEqual(['a', 'late']); // delivery is the consumer's filter problem, not a crash
        s.close();
    });
});

/* ──────────────── WebSocketLiveSource × ReconnectingSocket ──────────────── */

describe('live source over a managed socket — subscriptions survive a drop', () => {
    beforeEach(() => {
        MockWS.instances = [];
        MockWS.failConstructor = false;
        vi.useFakeTimers();
        vi.stubGlobal('WebSocket', MockWS as any);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('topics re-subscribe automatically after a mid-session disconnect', () => {
        const sock = new ReconnectingSocket('ws://live');
        const live = new WebSocketLiveSource(sock);
        live.subscribe('weather');
        live.subscribe('plaza');
        MockWS.instances[0].serverOpen();
        const subs = (w: MockWS) => w.sent.filter((f) => JSON.parse(f).op === 'subscribe').map((f) => JSON.parse(f).topic).sort();
        expect(subs(MockWS.instances[0])).toEqual(['plaza', 'weather']);

        // server pushes → poll drains
        MockWS.instances[0].serverSend(JSON.stringify({ topic: 'weather', data: { rain: 1 } }));
        expect(live.poll()).toMatchObject([{ topic: 'weather', data: { rain: 1 } }]);

        // DROP mid-session → reconnect → the SAME topics are re-announced, unprompted
        MockWS.instances[0].serverDrop();
        expect(live.status).toBe('closed');
        vi.advanceTimersByTime(1000);
        MockWS.instances[1].serverOpen();
        expect(live.status).toBe('open');
        expect(subs(MockWS.instances[1]), 'resubscribed after reconnect').toEqual(['plaza', 'weather']);

        // and pushes flow again
        MockWS.instances[1].serverSend(JSON.stringify({ topic: 'plaza', data: 7 }));
        expect(live.poll()).toMatchObject([{ topic: 'plaza', data: 7 }]);
        live.dispose();
    });
});

/* ────────────────────────── ServiceHub ────────────────────────── */

describe('ServiceHub — registry / status map / teardown', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('registry: http(name) resolves, unknown name throws (registration is explicit), adhoc is off-registry', () => {
        const hub = new ServiceHub();
        hub.register('board', 'http://b');
        expect(hub.http('board').base).toBe('http://b');
        expect(hub.has('game')).toBe(false);
        expect(() => hub.http('game')).toThrow(/unknown service/);
        const ad = hub.adhoc('http://elsewhere');
        expect(ad.base).toBe('http://elsewhere');
        expect(hub.has('elsewhere')).toBe(false);
    });

    it('one status map + named events across services', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: any) =>
            String(url).includes('alive') ? jsonResponse({ ok: true }) : Promise.reject(new TypeError('down'))));
        const hub = new ServiceHub();
        hub.register('game', 'http://alive');
        hub.register('board', 'http://dead');
        const events: string[] = [];
        hub.onStatus((name, s) => events.push(`${name}:${s}`));
        await hub.http('game').probe();
        await hub.http('board').probe();
        expect(hub.statuses()).toEqual({ game: 'online', board: 'offline' });
        expect(events.sort()).toEqual(['board:offline', 'game:online']);
    });

    it('closeAll(): every managed socket is finally closed (no reconnect zombies)', () => {
        vi.useFakeTimers();
        vi.stubGlobal('WebSocket', MockWS as any);
        MockWS.instances = [];
        MockWS.failConstructor = false;
        const hub = new ServiceHub();
        hub.socket('ws://a');
        hub.socket('ws://b');
        MockWS.instances.forEach((w) => w.serverOpen());
        MockWS.instances[0].serverDrop();          // one is mid-reconnect at teardown
        hub.closeAll();
        vi.advanceTimersByTime(60_000);
        expect(MockWS.instances, 'no dial after closeAll').toHaveLength(2);
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });
});
