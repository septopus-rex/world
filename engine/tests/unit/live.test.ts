import { describe, it, expect } from 'vitest';
import { MemoryLiveSource, NullLiveSource } from '../../src/core/services/LiveSource';
import { LiveSystem } from '../../src/core/systems/LiveSystem';
import { EventQueue } from '../../src/core/events/EventQueue';
import { SystemMode } from '../../src/core/types/SystemMode';

// L1 — the realtime transport (ILiveSource) + the LiveSystem bridge into
// world.events. Pull model: nothing enters the sim except via poll() at the
// LiveSystem step point, so everything here is deterministic.

describe('MemoryLiveSource (mock transport)', () => {
    it('buffers only subscribed topics, drains FIFO, then empties', () => {
        const src = new MemoryLiveSource();
        src.subscribe('chat');
        src.push('chat', { a: 1 });
        src.push('telemetry', { b: 2 }); // not subscribed → dropped
        src.push('chat', { a: 2 });

        const first = src.poll();
        expect(first.map((m) => m.data)).toEqual([{ a: 1 }, { a: 2 }]);
        expect(first.every((m) => m.topic === 'chat')).toBe(true);
        expect(src.poll()).toEqual([]); // drained
    });

    it('unsubscribe stops buffering', () => {
        const src = new MemoryLiveSource();
        src.subscribe('chat');
        src.unsubscribe('chat');
        src.push('chat', {});
        expect(src.poll()).toEqual([]);
    });

    it('send() records an outbox', () => {
        const src = new MemoryLiveSource();
        src.send('chat', { hello: 1 });
        expect(src.outbox()).toEqual([{ topic: 'chat', data: { hello: 1 } }]);
    });
});

describe('NullLiveSource (inert default)', () => {
    it('polls nothing', () => {
        const src = new NullLiveSource();
        src.subscribe('x');
        expect(src.poll()).toEqual([]);
    });
});

describe('LiveSystem (transport → world.events)', () => {
    function fakeWorld(liveSource: any) {
        const host = { frame: 0, mode: SystemMode.Normal };
        const events = new EventQueue(host as any);
        return { world: { events, liveSource } as any, events };
    }

    it('re-emits each polled message as live.message keyed by topic', () => {
        const src = new MemoryLiveSource();
        src.subscribe('chat');
        src.push('chat', { text: 'hi' }, 1234);
        const { world, events } = fakeWorld(src);
        const reader = events.reader('live.message');

        new LiveSystem().update(world, 1 / 60);

        const got = reader.read();
        expect(got.length).toBe(1);
        expect(got[0].payload).toEqual({ topic: 'chat', data: { text: 'hi' }, ts: 1234 });
        expect(got[0].targetKey).toBe('chat'); // consumers subscribe by topic
    });

    it('nothing surfaces before the poll point (determinism)', () => {
        const src = new MemoryLiveSource();
        src.subscribe('chat');
        src.push('chat', {});
        const { events } = fakeWorld(src);
        const reader = events.reader('live.message');
        // Not updated yet → no events have entered the sim.
        expect(reader.read()).toEqual([]);
    });

    it('emits live.status once per status change', () => {
        const src = new MemoryLiveSource();
        const { world, events } = fakeWorld(src);
        const reader = events.reader('live.status');
        const sys = new LiveSystem();

        sys.update(world, 1 / 60);
        expect(reader.read().map((e) => e.payload)).toEqual([{ transport: 'memory', status: 'open' }]);

        sys.update(world, 1 / 60); // unchanged → no new status event
        expect(reader.read()).toEqual([]);

        src.setStatus('closed');
        sys.update(world, 1 / 60);
        expect(reader.read().map((e) => (e.payload as any).status)).toEqual(['closed']);
    });
});
