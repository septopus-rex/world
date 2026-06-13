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
