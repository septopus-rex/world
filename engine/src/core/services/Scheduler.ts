/**
 * Scheduler — deterministic simulation-time task queue (F1, spec
 * docs/plan/specs/scheduler-and-spawn.md §3).
 *
 * THE TIME AXIOM (spec §0): tasks run on SIMULATION time — an accumulator fed
 * dt by ScheduleSystem every step. Never the wall clock (no setTimeout / no
 * Date.now — the codebase-wide rule), never the chain-height world calendar
 * (it JUMPS; a timer on it would burst-fire or skip). Same (initial state,
 * dt sequence) → tasks fire on the SAME frames — the replay prerequisite of
 * protocol/game.md §9.
 *
 * Ordering: tasks execute in (dueTime, seq) order — seq is registration order,
 * so two tasks due the same frame run in the order they were scheduled.
 * Catch-up: a large dt that crosses several due points fires them ONE BY ONE
 * (a repeating task can fire multiple times inside one tick) — never coalesced.
 *
 * Persistence: NONE, by decision (spec §2.2) — pending tasks die with the
 * session; spawners/triggers re-arm on block re-entry (the arcade-cabinet
 * philosophy; nothing derivable is persisted).
 *
 * Pure core: no Three.js, no World import — callbacks close over what they need.
 */

export interface TaskHandle {
    /** Monotonic id — also the tiebreaker for same-dueTime ordering. */
    readonly seq: number;
}

interface Task {
    seq: number;
    dueTime: number;        // absolute sim-time (s)
    interval: number | null; // null = one-shot; >0 = repeat period (s)
    fn: () => void;
    cancelled: boolean;
}

export class Scheduler {
    /** Simulation-time accumulator (s). Advances only via tick(dt). */
    private simTime = 0;
    private nextSeq = 1;
    /** Pending tasks. Kept UNSORTED; tick() selects due tasks in (dueTime, seq)
     *  order — task counts are small (spawners + delays), an O(n) scan per pop
     *  beats maintaining a heap and keeps cancellation trivial. */
    private tasks = new Map<number, Task>();

    public get now(): number { return this.simTime; }
    /** Diagnostics: number of pending (non-cancelled) tasks. */
    public get pending(): number { return this.tasks.size; }

    /** Run `fn` once, `seconds` from now (sim time). */
    public after(seconds: number, fn: () => void): TaskHandle {
        return this.add(seconds, null, fn);
    }

    /** Run `fn` every `seconds` (first fire one period from now). */
    public every(seconds: number, fn: () => void): TaskHandle {
        return this.add(seconds, Math.max(seconds, 1e-6), fn);
    }

    public cancel(handle: TaskHandle | null | undefined): void {
        if (!handle) return;
        const t = this.tasks.get(handle.seq);
        if (t) { t.cancelled = true; this.tasks.delete(t.seq); }
    }

    private add(delaySeconds: number, interval: number | null, fn: () => void): TaskHandle {
        const seq = this.nextSeq++;
        const delay = Number.isFinite(delaySeconds) ? Math.max(0, delaySeconds) : 0;
        this.tasks.set(seq, { seq, dueTime: this.simTime + delay, interval, fn, cancelled: false });
        return { seq };
    }

    /**
     * Advance simulation time and fire everything due, one task at a time in
     * (dueTime, seq) order. A repeating task re-queues at dueTime + interval —
     * still inside this tick if the dt crossed several periods (catch-up fires
     * each occurrence; spec §2.1). A task scheduling new tasks from inside its
     * callback participates immediately if the new task is already due.
     */
    public tick(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) return;
        this.simTime += dt;

        // Guard against a zero-interval repeat looping forever within one tick.
        let safety = 10000;
        for (;;) {
            const next = this.popDue();
            if (!next || --safety <= 0) break;
            if (next.interval != null) {
                // Re-queue BEFORE running (fn may cancel its own handle).
                next.dueTime += next.interval;
                this.tasks.set(next.seq, next);
            }
            next.fn();
        }
    }

    /** Earliest due task at current simTime, removed from the queue; null if none. */
    private popDue(): Task | null {
        let best: Task | null = null;
        for (const t of this.tasks.values()) {
            if (t.dueTime > this.simTime) continue;
            if (!best || t.dueTime < best.dueTime || (t.dueTime === best.dueTime && t.seq < best.seq)) {
                best = t;
            }
        }
        if (best) this.tasks.delete(best.seq);
        return best;
    }

    /** Full teardown (world dispose / tests). */
    public clear(): void {
        this.tasks.clear();
    }
}
