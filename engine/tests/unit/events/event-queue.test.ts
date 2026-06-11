import { describe, it, expect, vi } from 'vitest';
import { EventQueue } from '../../../src/core/events/EventQueue';
import { SystemMode } from '../../../src/core/types/SystemMode';

// L1 — event-bus PR-1: the frame-scoped double-buffered queue in isolation.
// Spec: docs/plan/specs/event-bus-design.md §2 / §5.

function makeQueue() {
    const host = { frame: 0, mode: SystemMode.Normal };
    return { q: new EventQueue(host), host };
}

describe('EventQueue — readers (pull model)', () => {
    it('emit never runs callbacks; readers pull in emit order', () => {
        const { q } = makeQueue();
        const reader = q.reader('custom.test');
        let called = 0;
        q.on('custom.test', () => { called++; });

        q.emit('custom.test', { n: 1 });
        q.emit('custom.test', { n: 2 });
        expect(called).toBe(0);                       // boundary NOT dispatched at emit

        const events = reader.read();
        expect(events.map(e => (e.payload as any).n)).toEqual([1, 2]);
        expect(reader.read()).toEqual([]);            // cursor advanced
    });

    it('events live exactly 2 beginFrames; a lagging reader warns and jumps', () => {
        const { q } = makeQueue();
        const reader = q.reader('custom.t');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        q.emit('custom.t', { n: 1 });
        q.beginFrame();                                // event now in the prev half
        q.emit('custom.t', { n: 2 });
        q.beginFrame();                                // n=1 discarded, n=2 in prev half
        q.emit('custom.t', { n: 3 });

        const got = reader.read();                     // cursor 0 < oldest → warn + jump
        expect(got.map(e => (e.payload as any).n)).toEqual([2, 3]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('readFor filters by target; clear aligns the cursor silently', () => {
        const { q } = makeQueue();
        const reader = q.reader('custom.t');
        q.emit('custom.t', {}, { target: 5 });
        q.emit('custom.t', {}, { target: 9 });
        expect(reader.readFor(5)).toHaveLength(1);

        q.emit('custom.t', {});
        reader.clear();
        expect(reader.read()).toEqual([]);
    });

    it('(frame, seq) stamps are monotonic and reset per frame', () => {
        const { q, host } = makeQueue();
        const reader = q.reader('custom.t');
        q.emit('custom.t', {});
        q.beginFrame();
        q.emit('custom.t', {});
        q.emit('custom.t', {});
        const [a, b, c] = reader.read();
        expect(a.frame).toBe(0); expect(a.seq).toBe(0);
        expect(b.frame).toBe(1); expect(b.seq).toBe(0);
        expect(c.frame).toBe(1); expect(c.seq).toBe(1);
        expect(host.frame).toBe(1);
    });
});

describe('EventQueue — boundary dispatch', () => {
    it('flushBoundary dispatches in (frame,seq) order across types, isolated', () => {
        const { q } = makeQueue();
        const order: string[] = [];
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        q.on('custom.a', () => { order.push('a'); throw new Error('boom'); });
        q.on('custom.b', () => order.push('b'));

        q.emit('custom.b', {});
        q.emit('custom.a', {});
        q.emit('custom.b', {});
        q.flushBoundary();

        expect(order).toEqual(['b', 'a', 'b']);       // emit order, throw isolated
        expect(err).toHaveBeenCalledOnce();
        err.mockRestore();
    });

    it('emissions from inside a boundary callback land in the NEXT flush', () => {
        const { q } = makeQueue();
        const seen: number[] = [];
        q.on('custom.t', (ev) => {
            seen.push((ev.payload as any).n);
            if ((ev.payload as any).n === 1) q.emit('custom.t', { n: 2 });
        });
        q.emit('custom.t', { n: 1 });
        q.flushBoundary();
        expect(seen).toEqual([1]);                     // no same-flush recursion
        q.flushBoundary();
        expect(seen).toEqual([1, 2]);
    });

    it('target/key-scoped subscriptions only see their events; dropTarget cleans', () => {
        const { q } = makeQueue();
        const hits: string[] = [];
        q.on('custom.t', () => hits.push('ent'), { target: 7 });
        q.on('custom.t', () => hits.push('key'), { key: 'adj:1_1:b8:0' });

        q.emit('custom.t', {}, { target: 7, targetKey: 'adj:1_1:b8:0' });
        q.emit('custom.t', {}, { target: 8 });
        q.flushBoundary();
        expect(hits).toEqual(['ent', 'key']);

        q.dropTarget(7);
        q.emit('custom.t', {}, { target: 7 });
        q.flushBoundary();
        expect(hits).toEqual(['ent', 'key']);          // ent sub gone with the entity
    });

    it('once fires exactly once; scope.dispose removes its whole group', () => {
        const { q } = makeQueue();
        let onceHits = 0, scopeHits = 0;
        q.on('custom.t', () => onceHits++, { once: true });
        const scope = q.scope();
        scope.on('custom.t', () => scopeHits++);

        q.emit('custom.t', {});
        q.flushBoundary();
        scope.dispose();
        q.emit('custom.t', {});
        q.flushBoundary();

        expect(onceHits).toBe(1);
        expect(scopeHits).toBe(1);
    });

    it('recording mirrors emits but skips BOUNDARY_ONLY ui channels', () => {
        const { q } = makeQueue();
        const recorded: string[] = [];
        const stop = q.startRecording(ev => recorded.push(ev.type));
        q.emit('custom.t', {});
        q.emit('ui.show_toast', { msg: 'x' } as any);
        stop();
        q.emit('custom.t', {});
        expect(recorded).toEqual(['custom.t']);
    });
});
