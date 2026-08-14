import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { EditSystem } from '../../src/core/systems/EditSystem';
import { SystemMode } from '../../src/core/types/SystemMode';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';
import { AdjunctType } from '../../src/core/types/AdjunctType';

/**
 * Stamping a 组合件 from the world palette (spp-editors.md §9) — the seam where
 * the library editor's output becomes world content.
 *
 * Two things are load-bearing and easy to get wrong: what lands is N ORDINARY
 * authored adjuncts (not a derived expansion, not one composite entity), and
 * one click is ONE undo step however many rows it produced.
 */

const A2 = AdjunctType.Box, B4 = AdjunctType.Stop;

const PACK: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'stamp-test', thickness: 0.2,
    closed: [{ key: 'solid', name: 'solid', parts: [{ type: A2, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] }] }],
    open: [{ key: 'empty', name: 'empty', parts: [] }],
    prefabs: [{
        key: 'bench', name: '长椅', size: 2, parts: [
            { type: A2, u: 0.06, v: 0.3, su: 0.88, sv: 0.4, w: 0.22, sw: 0.06, props: [7, [1, 1], 0, 1] },
            { type: A2, u: 0.1, v: 0.32, su: 0.07, sv: 0.36, w: 0, sw: 0.22, props: [9, [1, 1], 0, 1] },
            { type: B4, u: 0.06, v: 0.3, su: 0.88, sv: 0.4, w: 0, sw: 0.3, props: [0, null] },
        ],
    }],
};

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

async function armedEditor() {
    registerStylePack(PACK);
    const { engine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
    stepN(engine, 5);
    const blockEid = world.queryEntities('BlockComponent')[0];
    const edit = world.systems.findSystem(EditSystem)! as any;
    engine.setMode(SystemMode.Edit);
    edit.activeBlockId = blockEid;
    // The click point: block-local [8, 8, 0] in engine coordinates.
    const point = world.metrics.septopusToEngine([8, 8, 0], [2048, 2048]) as [number, number, number];
    /** Authored (non-derived, non-ground) adjuncts in the block. */
    const authored = () => world.queryEntities('AdjunctComponent')
        .map((e: number) => world.getComponent<any>(e, 'AdjunctComponent'))
        .filter((a: any) => a && !a.stdData?.derivedFrom && !(typeof a.adjunctId === 'string' && a.adjunctId.startsWith('ground')));
    return { engine, world, edit, point, authored };
}

describe('stamping a prefab from the edit palette', () => {
    it('one click lands every part as an ordinary authored adjunct', async () => {
        const { edit, world, point, authored } = await armedEditor();
        expect(authored()).toHaveLength(0);

        edit.placingPrefab = 'stamp-test#bench';
        edit.stampPrefabAt(world, point);

        const rows = authored();
        expect(rows).toHaveLength(3);
        // Not expansion output: a stamped bench is data the creator now owns.
        expect(rows.every((a: any) => !a.stdData.derivedFrom)).toBe(true);
        expect(rows.filter((a: any) => a.stdData.typeId === B4)).toHaveLength(1);
        // Placement is disarmed after a successful stamp (no accidental doubles).
        expect(edit.placingPrefab).toBeNull();
    });

    it('the cube stands ON the clicked point, centred on it', async () => {
        const { edit, world, point, authored } = await armedEditor();
        edit.placingPrefab = 'stamp-test#bench';
        edit.stampPrefabAt(world, point);

        // Seat: u 0.06..0.94 of a 2m cube ⇒ centred at x = 8 (the click), and
        // z = 0 (the surface) + (0.22 + 0.03) * 2 = 0.5 above it.
        const seat = authored().map((a: any) => a.stdData).find((s: any) => s.oz > 0.4 && s.oz < 0.6);
        expect(seat, 'the seat sits half a metre above the clicked surface').toBeTruthy();
        expect(seat.ox).toBeCloseTo(8, 2);
        expect(seat.oy).toBeCloseTo(8, 2);
    });

    it('one click is ONE undo step, however many parts it produced', async () => {
        const { edit, world, point, authored } = await armedEditor();
        edit.placingPrefab = 'stamp-test#bench';
        edit.stampPrefabAt(world, point);
        expect(edit.history.undoCount).toBe(1);

        edit.undo(world);
        expect(authored(), 'the whole bench went away together').toHaveLength(0);

        edit.redo(world);
        expect(authored(), 'and comes back together').toHaveLength(3);
    });

    it('a dangling ref disarms instead of placing nothing forever', async () => {
        const { edit, world, point, authored } = await armedEditor();
        edit.placingPrefab = 'stamp-test#no-such-thing';
        edit.stampPrefabAt(world, point);
        expect(authored()).toHaveLength(0);
        expect(edit.placingPrefab).toBeNull();
    });

    it('the per-block cap refuses the whole stamp, never half a bench', async () => {
        const { edit, world, point, authored } = await armedEditor();
        (world.config as any).block = { ...(world.config as any).block, max: 2 };  // room for 2, bench needs 3
        edit.placingPrefab = 'stamp-test#bench';
        edit.stampPrefabAt(world, point);
        expect(authored()).toHaveLength(0);
        expect(edit.placingPrefab, 'still armed — the creator can free space and retry').toBe('stamp-test#bench');
    });
});
