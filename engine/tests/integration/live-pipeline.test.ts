import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MemoryLiveSource } from '../../src/core/services/LiveSource';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

// L3 — the full realtime pipeline inside a real World.step():
//   MemoryLiveSource.push → LiveSystem.poll (in step) → world.events.emit
//   → flushBoundary → boundary subscriber. Proves LiveSystem is registered and
//   runs at the right point, deterministically.

class LocalApi {
    async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
    async view() { return null; }
    async module() { return {}; }
    async texture() { return {}; }
}

describe('live transport pipeline (headless World)', () => {
    it('a pushed message reaches a world.events boundary subscriber after one step', async () => {
        const live = new MemoryLiveSource();
        const { engine } = await makeHeadlessEngineWith({ api: new LocalApi() as any, liveSource: live });
        const world = engine.getWorld()!;

        // engine.live exposes exactly what was injected.
        expect(engine.live).toBe(live);
        expect((engine.live as any).kind).toBe('memory');

        const received: any[] = [];
        world.events.on('live.message', (ev) => received.push(ev.payload), { key: 'chat' });

        live.subscribe('chat');
        live.push('chat', { move: 'E5' });

        // Before stepping nothing has entered the sim.
        stepN(engine, 0);
        expect(received).toEqual([]);

        stepN(engine, 1);
        expect(received).toEqual([{ topic: 'chat', data: { move: 'E5' }, ts: undefined }]);
    });

    it('defaults to an inert NullLiveSource when none is injected', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: new LocalApi() as any });
        expect((engine.live as any).kind).toBe('null');
        // Stepping with the inert source is a harmless no-op.
        expect(() => stepN(engine, 3)).not.toThrow();
    });
});
