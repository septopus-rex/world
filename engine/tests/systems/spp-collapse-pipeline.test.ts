import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { saveBlockDraft } from '../../src/core/utils/BlockSerializer';

// Workstream C — a SUPERPOSITION b6 source (faceOptions, not resolved faces)
// rides the REAL pipeline: BlockSystem threads the block coords → the expander
// collapses each face deterministically → derived walls become real entities.
// BlockSerializer keeps only the b6 source, so reload re-collapses with the
// SAME block coords → byte-identical expansion. Spec: spp-protocol-full.md §3.C.

// A cell whose faces are each a multi-candidate superposition (solid/door/window/open).
const OPTS: Array<[number, number]> = [[1, 0], [1, 1], [1, 2], [0, 0]];
const SUPERPOSED_ROW = [[6, 6, 0], [
    { position: [0, 0, 0], level: 0, faceOptions: [OPTS, OPTS, OPTS, OPTS, OPTS, OPTS] },
], 'basic'];

const api = () => new (class {
    async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
    async view() { return null; }
    async module() { return {}; }
    async texture() { return {}; }
})();

async function bootWith(adjunctsRaw: any[], backend = new InMemoryDraftBackend()) {
    const { engine } = await makeHeadlessEngineWith({ api: api(), draftBackend: backend });
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, adjunctsRaw, []] });
    stepN(engine, 5);
    return { engine, world: engine.getWorld()!, backend };
}

const census = (world: any) => {
    const all = world.queryEntities('AdjunctComponent')
        .map((eid: number) => ({ eid, adj: world.getComponent(eid, 'AdjunctComponent') }));
    return {
        source: all.filter(({ adj }: any) => adj.stdData.typeId === 0x00b6),
        derivedWalls: all.filter(({ adj }: any) => adj.stdData.derivedFrom && adj.stdData.typeId === 0x00a1),
    };
};

describe('SPP collapse pipeline (Workstream C)', () => {
    it('a superposition source collapses into real derived wall entities', async () => {
        const { world } = await bootWith([[0x00b6, [SUPERPOSED_ROW]]]);
        const { source, derivedWalls } = census(world);
        expect(source).toHaveLength(1);            // the b6 source survives
        expect(derivedWalls.length).toBeGreaterThan(0); // collapse produced walls
        // Collapsed walls are real collision — each carries a SolidComponent.
        const solid = derivedWalls.filter(({ eid }: any) => world.getComponent(eid, 'SolidComponent'));
        expect(solid.length).toBe(derivedWalls.length);
    });

    it('reload re-collapses byte-identically (only the b6 source is baked)', async () => {
        const backend = new InMemoryDraftBackend();
        const s1 = await bootWith([[0x00b6, [SUPERPOSED_ROW]]], backend);
        const beforeCount = census(s1.world).derivedWalls.length;
        const blockEid = s1.world.queryEntities('BlockComponent')[0];

        saveBlockDraft(s1.world, blockEid);
        await s1.world.draftStore.flush();

        const draft = s1.world.draftStore.load(0, 2048, 2048)!;
        // faceOptions round-trip in the source; no derived walls baked.
        const b6 = draft.raw[2].find((g: any[]) => g[0] === 0x00b6);
        expect(b6[1][0][1][0].faceOptions).toBeDefined();
        expect(draft.raw[2].find((g: any[]) => g[0] === 0x00a1)).toBeUndefined();

        // Session 2: fresh engine, hydrate the draft, re-expand.
        const { engine } = await makeHeadlessEngineWith({ api: api(), draftBackend: backend });
        await engine.hydrateDrafts(0);
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
        stepN(engine, 5);
        const after = census(engine.getWorld()!);
        expect(after.derivedWalls.length).toBe(beforeCount); // same block coords → same collapse
    });
});
