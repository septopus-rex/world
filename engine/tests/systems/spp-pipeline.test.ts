import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { saveBlockDraft } from '../../src/core/utils/BlockSerializer';

// L3 — SPP M2: a b6 particle row rides the REAL pipeline. BlockSystem expands
// it into standard adjuncts (own entities: collision, triggers, LOD native);
// BlockSerializer persists ONLY the b6 source (derived pieces are never baked).
// Spec: docs/plan/specs/spp-integration.md.

/** One solid 4m cell with an interior 'in' trigger. */
const CELL = {
    position: [0, 0, 0], level: 0,
    faces: [[1, 0], [0, 0], [1, 0], [1, 1], [1, 0], [1, 0]], // roof, open floor, 3 solid, doorway north
    trigger: [{ type: 'in', actions: [{ type: 'flag', method: '', target: 'spp_in', params: [true] }] }],
};
const PARTICLE_ROW = [[6, 6, 0], [CELL], 'basic'];

async function bootWith(adjunctsRaw: any[], backend = new InMemoryDraftBackend()) {
    const api = new (class {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
        async view() { return null; }
        async module() { return {}; }
        async texture() { return {}; }
    })();
    const { engine } = await makeHeadlessEngineWith({ api, draftBackend: backend });
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, adjunctsRaw, []] });
    stepN(engine, 5);
    const world = engine.getWorld()!;
    return { engine, world, backend };
}

function census(world: any) {
    const adjuncts = world.queryEntities('AdjunctComponent')
        .map((eid: number) => ({ eid, adj: world.getComponent(eid, 'AdjunctComponent') }));
    return {
        source: adjuncts.filter(({ adj }: any) => adj.stdData.typeId === 0x00b6),
        derived: adjuncts.filter(({ adj }: any) => adj.stdData.derivedFrom),
        total: adjuncts.length,
    };
}

describe('SPP pipeline (M2)', () => {
    it('a b6 row expands into derived wall entities + a live cell trigger', async () => {
        const { world } = await bootWith([[0x00b6, [PARTICLE_ROW]]]);
        const { source, derived } = census(world);

        expect(source).toHaveLength(1);
        // roof 1 + south 1 + west 1 + east 1 + doorway 3 = 7 walls, + 1 trigger
        expect(derived).toHaveLength(8);
        expect(derived.every(({ adj }: any) => adj.adjunctId.startsWith('adj_2048_2048_182_0_d'))).toBe(true);

        // Walls are REAL collision: each derived a1 carries a SolidComponent.
        const solidWalls = derived.filter(({ eid, adj }: any) =>
            adj.stdData.typeId === 0x00a1 && world.getComponent(eid, 'SolidComponent'));
        expect(solidWalls).toHaveLength(7);

        // The cell trigger is a REAL TriggerComponent filling the cell.
        const trig = derived.find(({ eid }: any) => world.getComponent(eid, 'TriggerComponent'));
        expect(trig).toBeTruthy();
        const tc = world.getComponent(trig!.eid, 'TriggerComponent') as any;
        expect(tc.events[0].actions[0].target).toBe('spp_in');
    });

    it('walking into the cell fires the interior trigger (full sim)', async () => {
        const { engine, world } = await bootWith([[0x00b6, [PARTICLE_ROW]]]);
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const pTrans = world.getComponent(player, 'TransformComponent') as any;
        // Teleport into the cell interior (trigger volume center).
        const trigEid = world.queryEntities('TriggerComponent')[0];
        pTrans.position = [...(world.getComponent(trigEid, 'TransformComponent') as any).position];
        stepN(engine, 2);
        expect(world.globalFlags.spp_in).toBe(true);
    });

    it('serialization keeps ONLY the b6 source; reload re-expands identically', async () => {
        const backend = new InMemoryDraftBackend();
        const s1 = await bootWith([[0x00b6, [PARTICLE_ROW]]], backend);
        const before = census(s1.world);
        const blockEid = s1.world.queryEntities('BlockComponent')[0];

        saveBlockDraft(s1.world, blockEid);
        await s1.world.draftStore.flush();

        const draft = s1.world.draftStore.load(0, 2048, 2048)!;
        const b6 = draft.raw[2].find((g: any[]) => g[0] === 0x00b6);
        expect(b6[1]).toHaveLength(1);                       // the source row survives
        expect(b6[1][0][1][0].position).toEqual([0, 0, 0]);  // cells round-tripped
        const a1 = draft.raw[2].find((g: any[]) => g[0] === 0x00a1);
        expect(a1, 'derived walls must NOT be baked into the draft').toBeUndefined();

        // Session 2: fresh engine on the same backend; the hydrated draft
        // replaces the (empty) injected content and re-expands the particle.
        const s2 = await (async () => {
            const api = new (class {
                async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
                async view() { return null; }
                async module() { return {}; }
                async texture() { return {}; }
            })();
            const { engine } = await makeHeadlessEngineWith({ api, draftBackend: backend });
            await engine.hydrateDrafts(0);
            engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
            stepN(engine, 5);
            return { engine, world: engine.getWorld()! };
        })();
        const after = census(s2.world);
        expect(after.source).toHaveLength(1);
        expect(after.derived).toHaveLength(before.derived.length);
    });
});
