import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { createNullRenderEngine } from '../helpers/null-render-engine';
import { CountingDataSource, flushAsync } from '../helpers/fake-resources';

// End-to-end through the REAL World → BlockSystem → AdjunctSystem → AdjunctFactory
// path: a block placing an audio emitter (e2) and a video screen (e3) must resolve
// each source via ResourceManager and hand it to the render layer
// (attachAudioEmitter / attachVideoScreen). NullRenderEngine records the URLs it
// receives — proving the whole wiring works headlessly (real playback needs a
// browser; see spec §11).

// Block raw: [elevation, status, [[typeId, [rows]], ...], animations].
// Direct-URL sources resolve without a datasource lookup (ResourceManager.getAudioUrl
// / getVideoUrl `direct` branch), so no audio()/video() channel is needed here.
const AUDIO = 0x00e2, VIDEO = 0x00e3;
const mediaBlock = [0.2, 1, [
    [AUDIO, [[[0.4, 0.4, 0.4], [4, 4, 0], [0, 0, 0], 'http://cdn/ambient.mp3', 1, 1, 0.8, 10]]],
    [VIDEO, [[[3, 0.1, 1.8], [6, 4, 0], [0, 0, 0], 'http://cdn/clip.mp4', 1, 1, 1, 1]]],
], []];

describe('media adjuncts — end-to-end attach through the render layer', () => {
    it('resolves both sources and attaches audio + video to the render engine', async () => {
        const nullEngine = createNullRenderEngine();
        const { engine } = await makeHeadlessEngineWith({ api: new CountingDataSource(), nullEngine });

        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: mediaBlock, elevation: 0.2 });

        for (let i = 0; i < 20; i++) engine.step(1 / 60);
        await flushAsync();
        for (let i = 0; i < 5; i++) engine.step(1 / 60);
        await flushAsync();

        // The audio emitter reached attachAudioEmitter with its resolved URL...
        expect(nullEngine.__counts.soundsPlayed).toContain('http://cdn/ambient.mp3');
        // ...and the video screen reached attachVideoScreen with its resolved URL.
        expect(nullEngine.__counts.videosAttached).toContain('http://cdn/clip.mp4');
    });

    it('stops the media on block eviction (removeHandle cleanup path runs)', async () => {
        const nullEngine = createNullRenderEngine();
        const { engine } = await makeHeadlessEngineWith({ api: new CountingDataSource(), nullEngine });

        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: mediaBlock, elevation: 0.2 });
        for (let i = 0; i < 20; i++) engine.step(1 / 60);
        await flushAsync();

        const removedBefore = nullEngine.__counts.removed;
        engine.removeBlock(2048, 2048);
        // Eviction removes the adjunct handles (whose removeHandle stops the <video>/
        // PositionalAudio in the real engine) — at least the two media meshes.
        expect(nullEngine.__counts.removed).toBeGreaterThan(removedBefore);
    });
});
