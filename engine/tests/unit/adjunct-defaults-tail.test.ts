import { describe, it, expect } from 'vitest';
import { defaultRawFor, defaultTailFor, placementFor, placementTypes } from '../../src/core/edit/AdjunctDefaults';
import { listOptionPartKinds } from '../../src/core/spp/Variants';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// The starter-defaults split (2026-08-05): a raw row of the common shape is
// `[size, pos, rot, ...tail]`. The placement triple is world-absolute (palette)
// or a unit frame (SPP option editor); the TAIL is position-independent and
// therefore shared. These tests pin (a) the refactor changed no palette output,
// and (b) "can this type go in a unit frame" stays a mechanical shape test
// rather than a hand-kept whitelist that drifts.

const P: [number, number, number] = [4, 6, 2];

describe('defaultRawFor — unchanged by the tail split (golden rows)', () => {
    // Literal expectations, written independently of the implementation tables.
    const GOLDEN: Array<[number, any[]]> = [
        [AdjunctType.Wall, [[2, 0.3, 2.5], [4, 6, 3.25], [0, 0, 0], 0, [1, 1], 0, 1]],
        [AdjunctType.Box, [[1, 1, 1], [4, 6, 2.5], [0, 0, 0], 0, [1, 1], 0, 0]],
        [AdjunctType.Water, [[2, 2, 0.6], [4, 6, 2.3], [0, 0, 0], 0, [1, 1], 0, 0]],
        [AdjunctType.Cone, [[0.8, 0.8, 1], [4, 6, 2.5], [0, 0, 0], 0, [1, 1], 0, 0]],
        [AdjunctType.Ball, [[0.8, 0.8, 0.8], [4, 6, 2.4], [0, 0, 0], 0, [1, 1], 0, 0]],
        [AdjunctType.Sign, [[1.2, 2], [4, 6, 4.2], [0, 0, 0], 7, 1]],
        [AdjunctType.Stop, [[1, 1, 1], [4, 6, 2.5], [0, 0, 0], 0, null]],
        [AdjunctType.Trigger, [[2, 2, 2], [4, 6, 3], [0, 0, 0], 1, 0, []]],
        [AdjunctType.Link, [[2, 0.1, 2], [4, 6, 3], [0, 0, 0], 0, [1, 1], null, null, 'https://example.com']],
        [AdjunctType.Audio, [[0.4, 0.4, 0.4], [4, 6, 2.4], [0, 0, 0], '', 1, 1, 1, 8]],
        [AdjunctType.Video, [[3.2, 0.1, 1.8], [4, 6, 3.2], [0, 0, 0], '', 1, 1, 1, 1]],
        [AdjunctType.Board, [[2.4, 0.15, 1.6], [4, 6, 2.8], [0, 0, 0], 0, [1, 1], null, null, 'lobby', '留言板']],
        [AdjunctType.Module, [[2, 2, 2], [4, 6, 3], [0, 0, 0], 0]],
        // Non-placement layouts must be untouched by the refactor.
        [AdjunctType.Light, [1, [4, 6, 4.5], [0, 0, 0], 0xffeedd, 1, 12, Math.PI / 3, 0]],
        [AdjunctType.Item, [[4, 6, 2.4], 1, 0, 1, [0, 0, 0]]],
    ];

    it.each(GOLDEN)('type 0x%s keeps its exact starter row', (typeId, expected) => {
        expect(defaultRawFor(typeId, P)).toEqual(expected);
    });

    it('book keeps its pages + title tail', () => {
        const raw = defaultRawFor(AdjunctType.Book, P)!;
        expect(raw.slice(0, 3)).toEqual([[0.7, 0.2, 0.9], [4, 6, 3], [0, 0, 0]]);
        expect(raw[7]).toHaveLength(3);          // pages
        expect(raw[8]).toBe('无题之书');
    });

    it('the resource opt still reaches module / audio / video', () => {
        expect(defaultRawFor(AdjunctType.Module, P, { resource: 7 })![3]).toBe(7);
        expect(defaultRawFor(AdjunctType.Audio, P, { resource: 'a.mp3' })![3]).toBe('a.mp3');
        expect(defaultRawFor(AdjunctType.Video, P, { resource: 'v.mp4' })![3]).toBe('v.mp4');
    });

    it('unknown types are still null', () => {
        expect(defaultRawFor(0x00ff, P)).toBeNull();
    });
});

describe('defaultTailFor — the shared half', () => {
    it('IS the tail of defaultRawFor for every placement-shaped type', () => {
        for (const typeId of placementTypes()) {
            const raw = defaultRawFor(typeId, P)!;
            expect(raw.slice(3), `type 0x${typeId.toString(16)}`).toEqual(defaultTailFor(typeId));
        }
    });

    it('is null exactly for the types that are not [size,pos,rot,…]-shaped', () => {
        for (const t of [AdjunctType.Light, AdjunctType.Item, AdjunctType.Spp,
            AdjunctType.Motif, AdjunctType.Spawner, AdjunctType.Npc]) {
            expect(defaultTailFor(t), `type 0x${t.toString(16)}`).toBeNull();
            expect(placementFor(t)).toBeNull();
        }
    });
});

describe('listOptionPartKinds — what an option may contain', () => {
    const kinds = listOptionPartKinds();
    const ids = kinds.map(k => k.typeId);

    it('offers the surface-geometry types, including a4 module', () => {
        for (const t of [AdjunctType.Wall, AdjunctType.Box, AdjunctType.Ball,
            AdjunctType.Module, AdjunctType.Stop, AdjunctType.Sign, AdjunctType.Cone]) {
            expect(ids, `0x${t.toString(16)} should be offered`).toContain(t);
        }
        // a4 is absent from the world palette (needs a model picked first) but
        // IS valid in a unit frame — the two lists answer different questions.
        expect(ids).toContain(AdjunctType.Module);
    });

    it('excludes sources and logic — mechanically, via the shape test', () => {
        for (const t of [AdjunctType.Spp, AdjunctType.Motif, AdjunctType.Spawner,
            AdjunctType.Npc, AdjunctType.Item, AdjunctType.Light]) {
            expect(ids, `0x${t.toString(16)} must not be offered`).not.toContain(t);
        }
    });

    it('seeds each kind with the SAME tail the world palette uses (one source)', () => {
        for (const k of kinds) expect(k.props).toEqual(defaultTailFor(k.typeId));
    });

    it('names come from the engine enum, not a second table', () => {
        expect(kinds.find(k => k.typeId === AdjunctType.Wall)?.name).toBe('Wall');
        expect(kinds.find(k => k.typeId === AdjunctType.Module)?.name).toBe('Module');
    });

    it('covers more than the 5 types the editor used to hard-code', () => {
        expect(kinds.length).toBeGreaterThan(5);
    });
});
