import { describe, it, expect } from 'vitest';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { PLACEABLE_ADJUNCTS, defaultRawFor } from '../../src/core/edit/AdjunctDefaults';

// The link/QR adjunct (e1) — the working replacement for the old plug_link stub.
// A clickable panel that carries an external URL; serialization round-trips it so
// authored/edited links persist, and the transform renders a visible panel.

describe('link/QR adjunct (e1)', () => {
    const def = getBuiltinAdjunct(0x00e1)!;
    // [size, pos, rot, resource, repeat, animate, stop, url, texture]
    const raw = [[2, 0.1, 3], [5, 6, 1.5], [0, 0, 0], 0, [1, 1], null, null, 'https://septopus.world', 7];

    it('is registered at 0x00e1', () => {
        expect(def).toBeDefined();
        expect(def.hooks.reg().typeId).toBe(0x00e1);
    });

    it('deserializes url + QR texture and round-trips through serialize', () => {
        const std = def.attribute!.deserialize(raw);
        expect(std.url).toBe('https://septopus.world');
        expect(std.material.texture).toBe('7');

        const back = def.attribute!.serialize(std);
        expect(back[7]).toBe('https://septopus.world');
        expect(back[8]).toBe('7');

        const std2 = def.attribute!.deserialize(back);
        expect(std2.url).toBe(std.url);
        expect(std2.x).toBe(2);            // size preserved
        expect(std2.oz).toBe(1.5);         // position preserved
    });

    it('renders a textured panel as a white-tinted box', () => {
        const std = def.attribute!.deserialize(raw);
        const ro = def.transform.stdToRenderData([std], 0)[0];
        expect(ro.type).toBe('box');
        expect(ro.material!.color).toBe(0xffffff); // textured → true colours
    });

    it('a plain (untextured) link uses the link colour and a thin panel', () => {
        const std = def.attribute!.deserialize([[2, 0.1, 3], [0, 0, 0], [0, 0, 0], 0, [1, 1], null, null, 'https://x.io']);
        const ro = def.transform.stdToRenderData([std], 0)[0];
        expect(ro.material!.color).toBe(0x2266cc);
        expect(std.material.texture).toBeUndefined();
    });
});

describe('link authoring (palette + URL form)', () => {
    const def = getBuiltinAdjunct(0x00e1)! as any;

    it('is placeable from the palette with a sensible default url', () => {
        expect(PLACEABLE_ADJUNCTS.some(e => e.typeId === 0x00e1)).toBe(true);
        const raw = defaultRawFor(0x00e1, [5, 6, 1])!;
        expect(raw[7]).toBe('https://example.com');
        expect(def.attribute.deserialize(raw).url).toBe('https://example.com');
    });

    it('exposes an editable URL field (text), pre-filled from stdData', () => {
        const groups = def.menu.form({ x: 2, y: 0.1, z: 2, url: 'https://septopus.world' });
        const urlField = groups.flatMap((g: any) => g.fields).find((f: any) => f.key === 'url');
        expect(urlField).toBeTruthy();
        expect(urlField.type).toBe('text');
        expect(urlField.value).toBe('https://septopus.world');
    });
});
