import { describe, it, expect } from 'vitest';
import { standardAttribute } from '../../src/plugins/adjunct/_shared';
import { AdjunctBox } from '../../src/plugins/adjunct/basic_box';
import { ResourceManager } from '../../src/render/ResourceManager';
import { FakeTextureLoader, CountingDataSource } from '../helpers/fake-resources';

// ─── Contract tests for the RESOURCE seams ───────────────────────────────────
//
// These lock the slot semantics the protocol pins down (texture.md §9,
// resource.md §6, adjunct-types.md §2/§4) into the ENGINE, so they cannot be
// silently reinterpreted to make one piece of content render:
//
//   · standard 7-slot primitives (a1 wall & co): slot 3 is a colour/palette
//     index and NEVER produces a texture; slot 7 is a colour.
//   · a2 box: the texture lives at slot 7 (catalog id / CID) — flipping that
//     slot to a colour would strip every textured wall/floor already shipped.
//   · ResourceManager locator whitelist: only scheme URLs and CIDs bypass the
//     catalog; a host-relative path is NOT an address (it breaks chain boot).
//
// 2026-07-21: an external AI did exactly these three flips to smuggle
// `/assets/*.png` strings through wall slot 3. If one of these tests is in
// your way, the fix is a protocol change (cn/en synced) — not an engine edit.

describe('resource contract — standard 7-slot primitives (a1/a5/a6/a7)', () => {
    it('slot 3 is a palette index: a string there does NOT become a texture', () => {
        const std = standardAttribute.deserialize([
            [1, 1, 1], [0, 0, 0], [0, 0, 0], '/assets/sneaky.png', [1, 1], null, 1,
        ]);
        expect(std.material?.texture, 'no texture channel exists on slot 3').toBeUndefined();
    });

    it('numeric slot 3 + slot 7 colour deserialize as resource + colour', () => {
        const std = standardAttribute.deserialize([
            [1, 1, 1], [0, 0, 0], [0, 0, 0], 5, [1, 1], null, 1, 0xff8800,
        ]);
        expect(std.material?.resource).toBe(5);
        expect(std.material?.color).toBe(0xff8800);
        expect(std.material?.texture).toBeUndefined();
    });

    it('slot 7 colour survives a serialize round-trip (and legacy rows stay 7-wide)', () => {
        const coloured = standardAttribute.serialize(
            standardAttribute.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], null, 1, 0x123456]));
        expect(coloured[7]).toBe(0x123456);
        const legacy = standardAttribute.serialize(
            standardAttribute.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], null, 1]));
        expect(legacy.length, 'no phantom slot 7 appears on legacy rows').toBe(7);
    });
});

describe('resource contract — a2 box texture slot', () => {
    const deser = AdjunctBox.attribute.deserialize;

    it('slot 7 is the texture: a catalog id there reaches material.texture', () => {
        const std = deser([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 0, 36]);
        expect(std.material?.texture, 'terran wall precedent: raw[7]=36').toBe('36');
    });

    it('slot 3 stays a palette index — a string there does NOT become a texture', () => {
        const std = deser([[1, 1, 1], [0, 0, 0], [0, 0, 0], '/assets/sneaky.png', [1, 1], 0, 0]);
        expect(std.material?.texture).toBeUndefined();
    });

    it('without slot 7 the box renders solid colour (no texture invented)', () => {
        const std = deser([[1, 1, 1], [0, 0, 0], [0, 0, 0], 2, [1, 1], 0, 0]);
        expect(std.material?.texture).toBeUndefined();
        expect(std.material?.resource).toBe(2);
    });
});

describe('resource contract — ResourceManager locator whitelist', () => {
    const makeRM = () => {
        const texLoader = new FakeTextureLoader();
        const ds = new CountingDataSource({}, {
            '7': { type: 'texture', format: 'png', raw: 'textures/checker.png' },
        });
        const rm = new ResourceManager(ds as any, { textureLoader: texLoader });
        return { rm, texLoader, ds };
    };

    it('a host-relative path is NOT a direct locator — it must go through the catalog (and fails without a record)', async () => {
        const { rm, texLoader } = makeRM();
        await expect(rm.getTexture('/assets/sneaky.png')).rejects.toThrow(/no texture record/);
        expect(texLoader.loadCount, 'nothing was fetched').toBe(0);
    });

    it('a scheme URL is a direct locator: loads without touching the catalog', async () => {
        const { rm, texLoader, ds } = makeRM();
        await rm.getTexture('https://example.com/tex.png');
        expect(texLoader.loadCount).toBe(1);
        expect(Object.keys(ds.textureCalls), 'no catalog lookup').toEqual([]);
    });

    it('a bare CID is a direct locator (content-addressed bytes)', async () => {
        const { rm, texLoader, ds } = makeRM();
        await rm.getTexture('bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy');
        expect(texLoader.loadCount).toBe(1);
        expect(Object.keys(ds.textureCalls)).toEqual([]);
    });

    it('a numeric id resolves through the catalog record', async () => {
        const { rm, texLoader, ds } = makeRM();
        await rm.getTexture('7');
        expect(ds.textureCalls['7']).toBe(1);
        expect(texLoader.loadCount).toBe(1);
    });
});
