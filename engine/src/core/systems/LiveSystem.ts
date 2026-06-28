import { World, ISystem } from '../World';
import { LiveStatus } from '../services/LiveSource';

/**
 * LiveSystem — the bridge from the injected realtime transport (ILiveSource)
 * into the frame-scoped event queue. Each frame it drains poll() and re-emits
 * every message as `live.message` (targetKey = topic, so consumers can subscribe
 * by topic), plus `live.status` whenever the connection state changes.
 *
 * This is the ONLY place external realtime data enters the simulation, and it
 * happens at a fixed point in step() — so adjuncts / systems react to it
 * deterministically and a recorded log replays identically. Adjuncts never touch
 * a socket: a "live" adjunct just subscribes to a topic and reacts to
 * live.message (e.g. a motif swaps its seed → BlockSystem.reexpandSource).
 *
 * Registered FIRST in the pipeline so messages are visible the SAME frame to
 * every later system (event-bus same-frame-visibility rule).
 */
export class LiveSystem implements ISystem {
    private lastStatus: LiveStatus | null = null;

    update(world: World, _dt: number): void {
        const src = world.liveSource;
        if (!src) return;

        const msgs = src.poll();
        for (const m of msgs) {
            world.events.emit(
                'live.message',
                { topic: m.topic, data: m.data, ts: m.ts },
                { targetKey: m.topic },
            );
        }

        const status = src.status;
        if (status && status !== this.lastStatus) {
            this.lastStatus = status;
            world.events.emit('live.status', { transport: src.kind, status });
        }
    }
}
