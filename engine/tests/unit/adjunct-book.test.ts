import { describe, it, expect } from 'vitest';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { PLACEABLE_ADJUNCTS, defaultRawFor } from '../../src/core/edit/AdjunctDefaults';

// The book adjunct (e4) — a readable paged-text panel, the inanimate sibling of
// the ba NPC's dialogue tree. It carries `pages: string[]` (inline dev明文, or a
// CID in production) which the client reads to open an in-scene reader. Serialize
// round-trips pages + title so authored/edited books persist; the transform
// renders a visible tome.

describe('book adjunct (e4)', () => {
    const def = getBuiltinAdjunct(0x00e4)!;
    // [size, pos, rot, resource, repeat, animate, stop, pages, title]
    const raw = [[0.7, 0.2, 0.9], [11, 8, 1.2], [0, 0, 0], 0, [1, 1], null, null,
        ['page one', 'page two', 'the end'], '八爪残卷'];

    it('is registered at 0x00e4', () => {
        expect(def).toBeDefined();
        expect(def.hooks.reg().typeId).toBe(0x00e4);
    });

    it('deserializes inline pages + title and round-trips through serialize', () => {
        const std = def.attribute!.deserialize(raw);
        expect(std.pages).toEqual(['page one', 'page two', 'the end']);
        expect(std.title).toBe('八爪残卷');

        const back = def.attribute!.serialize(std);
        expect(back[7]).toEqual(['page one', 'page two', 'the end']);
        expect(back[8]).toBe('八爪残卷');

        const std2 = def.attribute!.deserialize(back);
        expect(std2.pages).toEqual(std.pages);   // pages preserved
        expect(std2.x).toBe(0.7);                // size preserved
        expect(std2.oz).toBe(1.2);               // position preserved
    });

    it('coerces non-string page entries to strings and defaults an empty book', () => {
        const std = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], null, null, [1, 2]]);
        expect(std.pages).toEqual(['1', '2']);
        expect(std.title).toBe('');
        // no pages slot at all → empty (a bookless book is inert, not a crash)
        const empty = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
        expect(empty.pages).toEqual([]);
    });

    it('carries a CID/id page source unresolved (production seam) without rendering it as pages', () => {
        const std = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], null, null, 'bafyCID', 'Codex']);
        expect(std.pages).toEqual([]);            // not an inline array → no pages yet
        expect(std.pagesSource).toBe('bafyCID');  // resolvable later by the pipeline
        // serialize falls back to the unresolved source so it round-trips.
        expect(def.attribute!.serialize(std)[7]).toBe('bafyCID');
    });

    it('renders a leather-coloured upright tome', () => {
        const std = def.attribute!.deserialize(raw);
        const ro = def.transform.stdToRenderData([std], 0)[0];
        expect(ro.type).toBe('box');
        expect(ro.material!.color).toBe(0x8a5a2b);
    });
});

describe('book authoring (palette + title form)', () => {
    const def = getBuiltinAdjunct(0x00e4)! as any;

    it('is placeable from the palette with a sensible default story', () => {
        expect(PLACEABLE_ADJUNCTS.some(e => e.typeId === 0x00e4)).toBe(true);
        const raw = defaultRawFor(0x00e4, [5, 6, 1])!;
        const std = def.attribute.deserialize(raw);
        expect(std.pages.length).toBeGreaterThan(1);   // a multi-page starter
        expect(std.title).toBeTruthy();
    });

    it('exposes an editable Title field (text), pre-filled from stdData', () => {
        const groups = def.menu.form({ x: 0.7, y: 0.2, z: 0.9, title: '八爪残卷' });
        const titleField = groups.flatMap((g: any) => g.fields).find((f: any) => f.key === 'title');
        expect(titleField).toBeTruthy();
        expect(titleField.type).toBe('text');
        expect(titleField.value).toBe('八爪残卷');
    });
});
