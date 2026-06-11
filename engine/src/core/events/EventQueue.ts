import type { EntityId } from '../World';
import type { SystemMode } from '../types/SystemMode';
import {
    BOUNDARY_ONLY, EmitOptions, EventType, PayloadOf, SubOptions, Unsubscribe, WorldEvent,
} from './EventTypes';
import { EventChannel } from './EventChannel';
import { EventReader } from './EventReader';

interface Sub {
    cb: (ev: WorldEvent) => void;
    once?: boolean;
}

interface BoundaryTable {
    global: Sub[];
    byTarget: Map<EntityId, Sub[]>;
    byKey: Map<string, Sub[]>;
}

/**
 * EventQueue — frame-scoped, double-buffered event hub (event-bus spec PR-1).
 *
 * The core invariant: **emit never runs a callback.** Systems consume by
 * PULLING through readers; boundary callbacks (Engine facade / UI / loaders)
 * run only inside flushBoundary() — the single dispatch point at the end of
 * World.step — in global (frame, seq) order, each isolated by try/catch.
 *
 * Events live exactly 2 beginFrame() calls (see EventChannel). Events emitted
 * DURING flushBoundary are queued for the NEXT flush (a boundary callback can
 * never recurse into more boundary callbacks this frame).
 */
export class EventQueue {
    private channels = new Map<string, EventChannel>();
    private boundary = new Map<string, BoundaryTable>();
    private recorders: Array<(ev: WorldEvent) => void> = [];
    /** Events emitted since the last flush (the next flush batch). */
    private pendingDispatch: WorldEvent[] = [];
    private seq = 0;
    private flushing = false;

    constructor(private host: { frame: number; mode: SystemMode }) {}

    private channel(type: string): EventChannel {
        let ch = this.channels.get(type);
        if (!ch) { ch = new EventChannel(); this.channels.set(type, ch); }
        return ch;
    }

    /** Append-only from ANY context — never executes a callback synchronously. */
    public emit<K extends EventType>(type: K, payload: PayloadOf<K>, opts?: EmitOptions): void {
        const ev: WorldEvent<K> = {
            type, payload,
            target: opts?.target,
            targetKey: opts?.targetKey,
            actor: opts?.actor,
            frame: this.host.frame,
            seq: this.seq++,
            mode: this.host.mode,
        };
        this.channel(type).push(ev as WorldEvent);
        this.pendingDispatch.push(ev as WorldEvent);
        if (!BOUNDARY_ONLY.has(type)) {
            for (const record of this.recorders) record(ev as WorldEvent);
        }
    }

    /** Pull-model handle for systems. Hold it; read() each update. */
    public reader<K extends EventType>(type: K): EventReader<K> {
        return new EventReader<K>(this.channel(type), type);
    }

    /** Boundary subscription (Engine facade / UI / loader / net — NOT core systems). */
    public on<K extends EventType>(type: K, cb: (ev: WorldEvent<K>) => void, opts?: SubOptions): Unsubscribe {
        let table = this.boundary.get(type);
        if (!table) {
            table = { global: [], byTarget: new Map(), byKey: new Map() };
            this.boundary.set(type, table);
        }
        const sub: Sub = { cb: cb as (ev: WorldEvent) => void, once: opts?.once };

        let bucket: Sub[];
        if (opts?.target !== undefined) {
            bucket = table.byTarget.get(opts.target) ?? [];
            table.byTarget.set(opts.target, bucket);
        } else if (opts?.key !== undefined) {
            bucket = table.byKey.get(opts.key) ?? [];
            table.byKey.set(opts.key, bucket);
        } else {
            bucket = table.global;
        }
        bucket.push(sub);

        return () => {
            const i = bucket.indexOf(sub);
            if (i >= 0) bucket.splice(i, 1);
        };
    }

    /** Subscription group — dispose() unsubscribes everything registered through it. */
    public scope(): { on: EventQueue['on']; dispose(): void } {
        const subs: Unsubscribe[] = [];
        return {
            on: ((type, cb, opts) => {
                const un = this.on(type, cb, opts);
                subs.push(un);
                return un;
            }) as EventQueue['on'],
            dispose: () => { for (const un of subs.splice(0)) un(); },
        };
    }

    /** Frame bracket #1 (World.step head): frame++, rotate buffers, reset seq. */
    public beginFrame(): void {
        this.host.frame++;
        this.seq = 0;
        for (const ch of this.channels.values()) ch.flip();
    }

    /** Frame bracket #2 (World.step tail): dispatch to boundary subscribers in
     *  (frame, seq) order, each callback isolated. Emissions from inside a
     *  callback land in the NEXT flush batch. */
    public flushBoundary(): void {
        if (this.flushing) return;
        this.flushing = true;
        const batch = this.pendingDispatch;
        this.pendingDispatch = [];
        try {
            for (const ev of batch) {
                const table = this.boundary.get(ev.type);
                if (!table) continue;
                this.dispatch(table.global, ev);
                if (ev.target !== undefined) this.dispatch(table.byTarget.get(ev.target), ev);
                if (ev.targetKey !== undefined) this.dispatch(table.byKey.get(ev.targetKey), ev);
            }
        } finally {
            this.flushing = false;
        }
    }

    private dispatch(bucket: Sub[] | undefined, ev: WorldEvent): void {
        if (!bucket || bucket.length === 0) return;
        // Copy: a callback may unsubscribe (or once-expire) mid-dispatch.
        for (const sub of [...bucket]) {
            try {
                sub.cb(ev);
            } catch (e) {
                console.error(`[events] boundary subscriber for '${ev.type}' threw`, e);
            }
            if (sub.once) {
                const i = bucket.indexOf(sub);
                if (i >= 0) bucket.splice(i, 1);
            }
        }
    }

    /** Entity teardown: drop every ent-targeted boundary subscription. */
    public dropTarget(eid: EntityId): void {
        for (const table of this.boundary.values()) table.byTarget.delete(eid);
    }

    /** Mirror every non-BOUNDARY_ONLY emit (golden-log tests / debugging / net). */
    public startRecording(sink: (ev: WorldEvent) => void): Unsubscribe {
        this.recorders.push(sink);
        return () => {
            const i = this.recorders.indexOf(sink);
            if (i >= 0) this.recorders.splice(i, 1);
        };
    }

    public dispose(): void {
        this.channels.clear();
        this.boundary.clear();
        this.recorders = [];
        this.pendingDispatch = [];
    }
}
