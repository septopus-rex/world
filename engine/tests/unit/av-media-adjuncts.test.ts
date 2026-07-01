import { describe, it, expect } from 'vitest';
import { AdjunctAudio } from '../../src/plugins/adjunct/adjunct_audio';
import { AdjunctVideo } from '../../src/plugins/adjunct/adjunct_video';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { PLACEABLE_ADJUNCTS, defaultRawFor } from '../../src/core/edit/AdjunctDefaults';

// Data layer only (headless): (de)serialization round-trip, RenderObject media
// directive, registry + palette wiring. Actual <video>/WebAudio playback needs a
// browser (NullRenderEngine no-ops it) — see spec §11.

describe('e2/e3 media adjuncts — registry & palette', () => {
    it('both are registered under their type-ids', () => {
        expect(getBuiltinAdjunct(AdjunctType.Audio)).toBeDefined();
        expect(getBuiltinAdjunct(AdjunctType.Video)).toBeDefined();
        expect(AdjunctType.Audio).toBe(0x00e2);
        expect(AdjunctType.Video).toBe(0x00e3);
    });

    it('both are placeable and produce a default raw row', () => {
        const ids = PLACEABLE_ADJUNCTS.map(p => p.typeId);
        expect(ids).toContain(AdjunctType.Audio);
        expect(ids).toContain(AdjunctType.Video);
        expect(defaultRawFor(AdjunctType.Audio, [1, 2, 3])).not.toBeNull();
        expect(defaultRawFor(AdjunctType.Video, [1, 2, 3], { resource: 'clip.mp4' })?.[3]).toBe('clip.mp4');
    });
});

describe('audio emitter (e2)', () => {
    const raw = [[0.4, 0.4, 0.4], [0, 0, 0], [0, 0, 0], 'fountain.mp3', 1, 1, 0.7, 12];

    it('deserializes source + playback params, round-trips through serialize', () => {
        const std = AdjunctAudio.attribute!.deserialize(raw);
        expect(std.source).toBe('fountain.mp3');
        expect(std.autoplay).toBe(true);
        expect(std.loop).toBe(true);
        expect(std.volume).toBe(0.7);
        expect(std.refDistance).toBe(12);

        const back = AdjunctAudio.attribute!.serialize(std);
        expect(AdjunctAudio.attribute!.deserialize(back).source).toBe('fountain.mp3');
        expect(back[6]).toBe(0.7);
        expect(back[4]).toBe(1); // autoplay flag
    });

    it('renders a marker mesh carrying an audio media directive', () => {
        const std = AdjunctAudio.attribute!.deserialize(raw);
        const [obj] = AdjunctAudio.transform!.stdToRenderData!([std], 0);
        expect(obj.type).toBe('box');
        expect(obj.media?.kind).toBe('audio');
        expect(obj.media?.source).toBe('fountain.mp3');
        expect(obj.media?.loop).toBe(true);
    });

    it('omits the media directive when no source is set (bare marker)', () => {
        const std = AdjunctAudio.attribute!.deserialize([[0.4, 0.4, 0.4], [0, 0, 0], [0, 0, 0], '']);
        const [obj] = AdjunctAudio.transform!.stdToRenderData!([std], 0);
        expect(obj.media).toBeUndefined();
    });
});

describe('video screen (e3)', () => {
    const raw = [[3.2, 0.1, 1.8], [0, 0, 0], [0, 0, 0], 'bafyvideocid', 1, 1, 1, 0.9];

    it('deserializes source + playback params, round-trips through serialize', () => {
        const std = AdjunctVideo.attribute!.deserialize(raw);
        expect(std.source).toBe('bafyvideocid');
        expect(std.muted).toBe(true);
        expect(std.volume).toBe(0.9);

        const back = AdjunctVideo.attribute!.serialize(std);
        expect(AdjunctVideo.attribute!.deserialize(back).source).toBe('bafyvideocid');
        expect(back[6]).toBe(1); // muted flag
    });

    it('renders a panel carrying a video media directive', () => {
        const std = AdjunctVideo.attribute!.deserialize(raw);
        const [obj] = AdjunctVideo.transform!.stdToRenderData!([std], 5);
        expect(obj.type).toBe('box');
        expect(obj.media?.kind).toBe('video');
        expect(obj.media?.source).toBe('bafyvideocid');
        expect(obj.media?.muted).toBe(true);
        // elevation is folded into the part's Z offset
        expect(obj.params.position[2]).toBe(5);
    });

    it('defaults autoplay+loop+muted when flags are absent (autoplay-safe combo)', () => {
        const std = AdjunctVideo.attribute!.deserialize([[3.2, 0.1, 1.8], [0, 0, 0], [0, 0, 0], 'x.mp4']);
        expect(std.autoplay).toBe(true);
        expect(std.loop).toBe(true);
        expect(std.muted).toBe(true);
    });
});
