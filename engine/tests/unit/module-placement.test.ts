import { describe, it, expect } from 'vitest';
import { defaultRawFor } from '../../src/core/edit/AdjunctDefaults';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';

// G4-2: placing a 3D model (module / a4) through the editor palette. The client
// pushes its model catalog (Engine.setModuleCatalog); the palette appends a
// button per model; picking one arms module + that resource id, which
// defaultRawFor embeds into the placement raw.

describe('module palette placement (G4-2)', () => {
    it('defaultRawFor(module) embeds the picked resource id', () => {
        const raw = defaultRawFor(0x00a4, [5, 6, 1], { resource: 28 });
        expect(raw).not.toBeNull();
        expect(raw![3]).toBe(28);                       // [size, pos, rot, resourceId]
        const std = getBuiltinAdjunct(0x00a4)!.attribute!.deserialize(raw!);
        expect(std.module).toBe(28);                    // round-trips to the module field
    });

    it('serialize prefers the live resource over the stale deserialize-time module copy', () => {
        // EditTaskExecutor 'set' writes ONLY std.resource (executeSet merges the
        // param into stdData); std.module keeps the deserialize-time value. The
        // old serialize read `std.module ?? …` and silently persisted the
        // PRE-EDIT id into the draft.
        const attr = getBuiltinAdjunct(0x00a4)!.attribute!;
        const std = attr.deserialize([[1, 1, 1], [8, 8, 1], [0, 0, 0], 39, 0, 0]);
        std.resource = '44';
        expect(attr.serialize(std)[3]).toBe(44);        // numeric strings stay numeric ids
    });

    it('URL / `<cid>.<ext>` resources persist verbatim (worldlabs persist path)', () => {
        const attr = getBuiltinAdjunct(0x00a4)!.attribute!;
        const cidRes = 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy.spz';
        const std = attr.deserialize([[1, 1, 1], [8, 8, 1], [0, 0, 0], 39, 0, 0]);
        std.resource = cidRes;
        const raw = attr.serialize(std);
        expect(raw[3]).toBe(cidRes);                    // not NaN, not the stale 39
        expect(attr.deserialize(raw).resource).toBe(cidRes); // round-trips through a draft row
    });

    it('Engine.setModuleCatalog exposes models on the world for the palette', async () => {
        const { engine } = await makeHeadlessEngineWith({
            api: {
                async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
                async view() { return null; },
                async module() { return {}; },
                async texture() { return {}; },
            } as any,
        });
        expect(engine.getWorld()!.moduleCatalog).toEqual([]);     // empty by default
        engine.setModuleCatalog([{ id: 27, label: 'Pyramid' }, { id: 29, label: 'Fox' }]);
        expect(engine.getWorld()!.moduleCatalog.map((m: any) => m.label)).toEqual(['Pyramid', 'Fox']);
    });
});
