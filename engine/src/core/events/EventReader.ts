import type { EntityId } from '../World';
import type { EventType, WorldEvent } from './EventTypes';
import { EventChannel } from './EventChannel';

/**
 * EventReader — a system's pull-cursor over one event channel.
 *
 * Hold one persistently (lazily or in init); read() each update. A reader that
 * reads every frame never loses an event; a lagging cursor (system disabled
 * for >2 frames without clear()) is DETECTED — warn + jump to oldest — never
 * silent loss.
 */
export class EventReader<K extends EventType = EventType> {
    private cursor = 0;

    constructor(private channel: EventChannel, private type: K) {}

    /** New events since the last read (emit order). Returns a fresh array. */
    public read(): WorldEvent<K>[] {
        const out: WorldEvent<K>[] = [];
        this.readInto(out);
        return out;
    }

    /** Zero-allocation variant: append into a reused array, return the count. */
    public readInto(out: WorldEvent<K>[]): number {
        if (this.cursor < this.channel.oldest) {
            console.warn(`[events] reader('${this.type}') lagged — missed ${this.channel.oldest - this.cursor} event(s); jumping to oldest`);
            this.cursor = this.channel.oldest;
        }
        const n = this.channel.collectInto(this.cursor, out as WorldEvent[]);
        this.cursor = this.channel.total;
        return n;
    }

    /** Targeted consumption: only new events with target === eid. */
    public readFor(eid: EntityId): WorldEvent<K>[] {
        return this.read().filter(ev => ev.target === eid);
    }

    /** Drop unread events and align the cursor (call while mode-gated off). */
    public clear(): void {
        this.cursor = this.channel.total;
    }
}
