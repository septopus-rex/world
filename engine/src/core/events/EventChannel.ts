import type { WorldEvent } from './EventTypes';

/**
 * EventChannel — one double-buffered array per event type (module-private to
 * the events package).
 *
 * Cursor space is the channel's lifetime total: events alive right now occupy
 * [oldest, total). `flip()` (called at beginFrame) discards the half written
 * two frames ago, so every event survives exactly 2 beginFrame calls — long
 * enough for any system (registered before OR after the emitter) to read it.
 */
export class EventChannel {
    /** Current frame's writes. */
    private curr: WorldEvent[] = [];
    /** Previous frame's writes (still readable). */
    private prev: WorldEvent[] = [];

    /** Lifetime emit count == cursor upper bound. */
    public total = 0;
    /** Cursor of the oldest still-retrievable event. */
    public oldest = 0;

    public push(ev: WorldEvent): void {
        this.curr.push(ev);
        this.total++;
    }

    /** Frame boundary: drop the 2-frames-old half, rotate buffers. */
    public flip(): void {
        this.oldest += this.prev.length;
        this.prev = this.curr;
        this.curr = [];
    }

    /** Append events in [cursor, total) to `out`; returns the count appended. */
    public collectInto(cursor: number, out: WorldEvent[]): number {
        const from = Math.max(cursor, this.oldest);
        let appended = 0;
        const prevEnd = this.oldest + this.prev.length;
        for (let i = from; i < this.total; i++) {
            out.push(i < prevEnd ? this.prev[i - this.oldest] : this.curr[i - prevEnd]);
            appended++;
        }
        return appended;
    }
}
