import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeHeadlessEngine } from '../helpers/make-world';
import { reportError, ResourceError } from '../../src/core/errors';

// Proves the WorldEventSink wiring end-to-end: a live World auto-installs a sink
// (World constructor) that pushes reported errors onto world.events. This is the
// revival of two previously-DEAD channels — `resource.failed` (defined in
// EventTypes but never emitted before) and the new general `engine.error`. If a
// resource load fails, the client can finally hear about it (→ Toaster).

describe('error reporting → world.events (WorldEventSink)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('a reported ResourceError emits BOTH resource.failed and engine.error', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        // Readers created post-boot → cursor at current total, so only our emit
        // below is read (any boot-time reports are skipped).
        const failed = world.events.reader('resource.failed');
        const errch = world.events.reader('engine.error');

        reportError(
            new ResourceError('model 9 failed to load', { kind: 'model', id: '9' }),
            { tag: '[Test]', severity: 'warn' },
        );

        const rf = failed.read();
        expect(rf).toHaveLength(1);
        expect(rf[0].payload).toMatchObject({ kind: 'model', id: '9' });

        const ee = errch.read();
        expect(ee).toHaveLength(1);
        expect(ee[0].payload).toMatchObject({ code: 'RESOURCE_LOAD', severity: 'warn', kind: 'model', id: '9' });
    });

    it('a non-resource error emits engine.error only (no resource.failed)', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        const failed = world.events.reader('resource.failed');
        const errch = world.events.reader('engine.error');

        reportError(new Error('generic boom'), { tag: '[Test]', code: 'UNKNOWN', severity: 'error' });

        expect(failed.read()).toHaveLength(0);
        const ee = errch.read();
        expect(ee).toHaveLength(1);
        expect(ee[0].payload).toMatchObject({ code: 'UNKNOWN', severity: 'error' });
    });
});
