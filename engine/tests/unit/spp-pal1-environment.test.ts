import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp } from '../../src/core/spp/Expander';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';
import pal1Pack from '../../../client/core/src/stylepacks/pal1_inn.stylepack.json';
import villageCompoundLevel from '../../../client/core/src/levels/pal1_village_compound.level.json';
import manifest from '../../../client/core/src/assets/demo.manifest.json';

beforeAll(() => {
    registerStylePack(pal1Pack as unknown as StylePack);
});

describe('pal1_village_compound: Multi-Courtyard Environment SPP Integration', () => {
    it('verifies village compound level structure has 5 SPP chunks connecting 2 courtyards', () => {
        const block = villageCompoundLevel.blocks[0];
        expect(block).toBeDefined();

        const rawAdjuncts = block.raw[2];
        const sppGroup = rawAdjuncts.find((g: any) => g[0] === 182);
        expect(sppGroup).toBeDefined();

        const sppInstances = sppGroup[1];
        // Must contain 5 SPP chunks:
        // [0]: East Courtyard North Wing
        // [1]: East Courtyard Garden
        // [2]: West Courtyard North Wing
        // [3]: West Courtyard Garden
        // [4]: Connecting External Promenade & Landscape
        expect(sppInstances.length).toBe(5);

        expect(sppInstances[0][0]).toEqual([16, 12, 0]); // East Upper Wing
        expect(sppInstances[1][0]).toEqual([16, 4, 0]);  // East Courtyard Garden
        expect(sppInstances[2][0]).toEqual([4, 12, 0]);  // West Upper Wing
        expect(sppInstances[3][0]).toEqual([4, 4, 0]);   // West Courtyard Garden
        expect(sppInstances[4][0]).toEqual([0, 0, 0]);   // Outdoor Promenade
    });

    it('expands all 5 SPPs and validates all module assets against demo.manifest.json', () => {
        const block = villageCompoundLevel.blocks[0];
        const sppGroup = block.raw[2].find((g: any) => g[0] === 182);
        const sppInstances = sppGroup[1];

        const manifestIds = new Set(manifest.map((m: any) => m.id));

        // Ensure newly added environmental models 110-114 exist in manifest
        for (const envId of [110, 111, 112, 113, 114]) {
            expect(manifestIds.has(envId)).toBe(true);
        }

        let totalExpandedRows = 0;
        for (const spp of sppInstances) {
            const rows = expandSpp(spp);
            expect(rows.length).toBeGreaterThan(0);
            totalExpandedRows += rows.length;

            for (const [typeId, raw] of rows) {
                if (typeId === 164) {
                    const resourceId = raw[3];
                    expect(manifestIds.has(resourceId)).toBe(true);
                    expect(raw[0][0]).toBeGreaterThan(0);
                    expect(raw[0][1]).toBeGreaterThan(0);
                    expect(raw[0][2]).toBeGreaterThan(0);
                }
                if (typeId === 180) {
                    // All stops in expanded stylepack must be hidden (slot 6 truthy)
                    expect(raw[6]).toBeTruthy();
                }
            }
        }

        expect(totalExpandedRows).toBeGreaterThan(150);
    });

    it('verifies level furniture and collision stops are properly formed and hidden', () => {
        const block = villageCompoundLevel.blocks[0];
        const rawAdjuncts = block.raw[2];

        // Type 164: Level furniture models
        const furnitureGroup = rawAdjuncts.find((g: any) => g[0] === 164);
        expect(furnitureGroup).toBeDefined();
        const furnitureRows = furnitureGroup[1];
        expect(furnitureRows.length).toBeGreaterThan(10);

        const manifestIds = new Set(manifest.map((m: any) => m.id));
        for (const row of furnitureRows) {
            const modelId = row[3];
            expect(manifestIds.has(modelId)).toBe(true);
        }

        // Type 180: Collision stops
        const stopGroup = rawAdjuncts.find((g: any) => g[0] === 180);
        expect(stopGroup).toBeDefined();
        for (const stop of stopGroup[1]) {
            // Must have hidden flag (slot 6 = 1)
            expect(stop[6]).toBe(1);
        }
    });
});
