import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp } from '../../src/core/spp/Expander';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';
import pal1Pack from '../../../client/core/src/stylepacks/pal1_inn.stylepack.json';
import courtyardLevel from '../../../client/core/src/levels/pal1_courtyard.level.json';
import manifest from '../../../client/core/src/assets/demo.manifest.json';

beforeAll(() => {
    registerStylePack(pal1Pack as unknown as StylePack);
});

describe('pal1_courtyard: Multi-SPP Compound Integration', () => {
    it('verifies pal1_courtyard level structure has multiple SPPs', () => {
        const block = courtyardLevel.blocks[0];
        expect(block).toBeDefined();

        const rawAdjuncts = block.raw[2];
        const sppGroup = rawAdjuncts.find((g: any) => g[0] === 182);
        expect(sppGroup).toBeDefined();

        const sppInstances = sppGroup[1];
        // Must contain at least 2 distinct SPP chunks (Guest Wing + Courtyard Garden)
        expect(sppInstances.length).toBeGreaterThanOrEqual(2);

        const spp1 = sppInstances[0]; // Upper Wing
        const spp2 = sppInstances[1]; // Courtyard Garden

        expect(spp1[0]).toEqual([2, 10, 0]); // Origin
        expect(spp2[0]).toEqual([2, 2, 0]);  // Origin
        expect(spp1[2]).toBe('pal1_inn');
        expect(spp2[2]).toBe('pal1_inn');
    });

    it('expands both SPP chunks and verifies boundary interface', () => {
        const block = courtyardLevel.blocks[0];
        const sppGroup = block.raw[2].find((g: any) => g[0] === 182);
        const sppInstances = sppGroup[1];

        const rows1 = expandSpp(sppInstances[0]);
        const rows2 = expandSpp(sppInstances[1]);

        expect(rows1.length).toBeGreaterThan(50);
        expect(rows2.length).toBeGreaterThan(20);

        // Collect all manifest IDs
        const manifestIds = new Set(manifest.map((m: any) => m.id));

        // Check all module rows in both SPPs reference valid manifest assets
        for (const [typeId, raw] of [...rows1, ...rows2]) {
            if (typeId === 164) {
                const resourceId = raw[3];
                expect(manifestIds.has(resourceId)).toBe(true);
                // Ensure size and pos are non-degenerate
                expect(raw[0][0]).toBeGreaterThan(0);
                expect(raw[0][1]).toBeGreaterThan(0);
                expect(raw[0][2]).toBeGreaterThan(0);
                expect(Number.isFinite(raw[1][0])).toBe(true);
                expect(Number.isFinite(raw[1][1])).toBe(true);
                expect(Number.isFinite(raw[1][2])).toBe(true);
            }
        }

        // Verify boundary interface between SPP 1 (Y=10) and SPP 2 (Y=2..10):
        // In SPP 1, the center bay corridor cell (1, 0, 0) Front face (South) is `corridor_open`
        const cell1 = sppInstances[0][1].find((c: any) => c.position[0] === 1 && c.position[1] === 0);
        expect(cell1.faces[2][1]).toBe('corridor_open');

        // In SPP 2, the center plaza cell (1, 1, 0) Back face (North) is `empty`
        const cell2 = sppInstances[1][1].find((c: any) => c.position[0] === 1 && c.position[1] === 1);
        expect(cell2.faces[3][0]).toBe(0); // FaceState.Open

        // In SPP 2, the south entrance (1, 0, 0) Front face is `moon_gate`
        const moonGateCell = sppInstances[1][1].find((c: any) => c.position[0] === 1 && c.position[1] === 0);
        expect(moonGateCell.faces[2][1]).toBe('moon_gate');
    });

    it('verifies authored courtyard adjuncts reference valid assets', () => {
        const block = courtyardLevel.blocks[0];
        const rawAdjuncts = block.raw[2];
        const moduleGroup = rawAdjuncts.find((g: any) => g[0] === 164);
        expect(moduleGroup).toBeDefined();

        const modules = moduleGroup[1];
        expect(modules.length).toBeGreaterThanOrEqual(4);

        const manifestIds = new Set(manifest.map((m: any) => m.id));
        for (const mod of modules) {
            const resId = mod[3];
            expect(manifestIds.has(resId)).toBe(true);
        }
    });
});
