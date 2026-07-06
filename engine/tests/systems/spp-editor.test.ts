import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { BlockSystem } from '../../src/core/systems/BlockSystem';
import { defaultRawFor } from '../../src/core/edit/AdjunctDefaults';
import { codeFromFace, normalizeSppFaces } from '../../src/core/spp/faceCodes';

// G4-3: SPP cells are placeable from the editor palette. A placed b6 expands
// into live derived pieces immediately (no reload), edits re-expand, and
// delete/undo clean up the derived pieces.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function countDerived(world: any, sourceId: string) {
    let n = 0, solid = 0;
    for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
        const a = world.getComponent(eid, 'AdjunctComponent');
        if (a?.stdData?.derivedFrom === sourceId) {
            n++;
            if (world.getComponent(eid, 'SolidComponent')) solid++;
        }
    }
    return { n, solid };
}

describe('SPP palette placement + live expansion (G4-3)', () => {
    it('places a b6 cell that expands live; edit re-expands, delete cleans up', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
        stepN(engine, 5);
        const blockEid = world.queryEntities('BlockComponent')[0];
        const bs = world.systems.findSystem(BlockSystem)!;

        // Place a default solid cell via the same path the palette uses.
        const raw = defaultRawFor(0x00b6, [8, 8, 1])!;
        const srcEid = bs.spawnAdjunct(world, blockEid, 0x00b6, raw)!;
        const src = world.getComponent<any>(srcEid, 'AdjunctComponent');
        expect(src.stdData.typeId).toBe(0x00b6);
        const sid = src.adjunctId;

        const before = countDerived(world, sid);
        expect(before.n).toBeGreaterThan(0);          // expanded immediately
        expect(before.solid).toBe(before.n);          // all-solid cell → every face collides

        // Open the top face → re-expand → fewer pieces (open faces emit nothing).
        src.stdData.cells[0].faces[0] = [0, 0];
        bs.reexpandSource(world, srcEid);
        const after = countDerived(world, sid);
        expect(after.n).toBeLessThan(before.n);

        // Delete the source's derived pieces.
        bs.destroyDerived(world, sid);
        expect(countDerived(world, sid).n).toBe(0);
    });

    it('defaultRawFor(b6) is a single solid 4m cell on the basic theme', () => {
        const raw = defaultRawFor(0x00b6, [3, 4, 1])!;
        expect(raw[0]).toEqual([3, 4, 1]);            // origin
        expect(raw[1]).toHaveLength(1);               // one cell
        expect(raw[1][0].faces).toHaveLength(6);
        expect(raw[1][0].faces.every((f: any) => f[0] === 1 && f[1] === 0)).toBe(true); // all solid
        expect(raw[2]).toBe('basic');
    });

    it('face codes fold into cells[0].faces and round-trip', () => {
        const std: any = {
            cells: [{ position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]] }],
            faceFront: 'doorway', faceTop: 'open',
        };
        normalizeSppFaces(std);
        expect(std.cells[0].faces[2]).toEqual([1, 1]); // Front → doorway
        expect(std.cells[0].faces[0]).toEqual([0, 0]); // Top → open
        expect(std.faceFront).toBeUndefined();         // temp keys stripped
        expect(codeFromFace(std.cells[0].faces[2])).toBe('doorway');
        expect(codeFromFace(std.cells[0].faces[1])).toBe('solid');
    });
});
