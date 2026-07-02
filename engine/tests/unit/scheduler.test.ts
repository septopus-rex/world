import { describe, it, expect } from 'vitest';
import { Scheduler } from '../../src/core/services/Scheduler';

// F1 scheduler (spec scheduler-and-spawn.md §2.1/§3.1): simulation-time tasks,
// (dueTime, seq) total order, one-by-one catch-up, deterministic across replays.

describe('Scheduler · determinism', () => {
    it('after() fires on the exact crossing tick, deterministically across replays', () => {
        const run = () => {
            const s = new Scheduler();
            const fired: number[] = [];
            let frame = 0;
            s.after(0.5, () => fired.push(frame));
            for (frame = 1; frame <= 60; frame++) s.tick(1 / 60);
            return fired;
        };
        const a = run();
        const b = run();
        expect(a).toEqual(b);            // replay-identical
        expect(a).toEqual([31]);         // 0.5s at 60fps → fires on frame 31 (30/60 s < 0.5 ≤ 31/60 s)
    });

    it('every() fires each period; same-frame order follows registration (seq)', () => {
        const s = new Scheduler();
        const log: string[] = [];
        s.every(0.1, () => log.push('A'));
        s.every(0.1, () => log.push('B'));  // same period, registered second
        // 31 ticks ≈ 0.5167s — comfortably past the 5th period. (30 ticks sums to
        // 0.4999999999999999 in float, one ULP short of 0.5 — deterministic, but a
        // lesson for authored content: don't rely on exact period-boundary ticks.)
        for (let i = 0; i < 31; i++) s.tick(1 / 60);
        expect(log.filter(x => x === 'A')).toHaveLength(5);
        expect(log.filter(x => x === 'B')).toHaveLength(5);
        // pairwise A before B on every shared due frame
        for (let i = 0; i < log.length; i += 2) expect(log.slice(i, i + 2)).toEqual(['A', 'B']);
    });

    it('catch-up: one large dt crossing several periods fires each occurrence', () => {
        const s = new Scheduler();
        let n = 0;
        s.every(1, () => n++);
        s.tick(3.5);                 // crosses t=1,2,3
        expect(n).toBe(3);
        s.tick(0.5);                 // t=4 boundary reached exactly
        expect(n).toBe(4);
    });

    it('cancel() stops both one-shots and repeats; self-cancel inside fn works', () => {
        const s = new Scheduler();
        let a = 0, b = 0;
        const ha = s.after(1, () => a++);
        s.cancel(ha);
        const hb = s.every(1, () => { b++; if (b >= 2) s.cancel(hb); });
        for (let i = 0; i < 10; i++) s.tick(1);
        expect(a).toBe(0);
        expect(b).toBe(2);
    });

    it('a task scheduling an already-due task runs it within the same tick', () => {
        const s = new Scheduler();
        const log: string[] = [];
        s.after(1, () => { log.push('outer'); s.after(0, () => log.push('inner')); });
        s.tick(2);
        expect(log).toEqual(['outer', 'inner']);
    });

    it('ignores garbage dt and never fires early', () => {
        const s = new Scheduler();
        let n = 0;
        s.after(1, () => n++);
        s.tick(NaN); s.tick(-5); s.tick(0);
        expect(n).toBe(0);
        s.tick(0.999); expect(n).toBe(0);
        s.tick(0.002); expect(n).toBe(1);
    });
});
