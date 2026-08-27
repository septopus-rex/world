import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import type { InventoryComponent } from '../../src/core/components/InventoryComponent';
import partyRoyaleBlock from '../../../client/core/src/blocks/party_royale.block.json';

// Register item catalog
registerDemoItems();

const PARTY_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: PARTY_BLOCK,
    position: [8, 2, 8.5] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
};

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function player(world: any): number {
    return world.queryEntities('TransformComponent', 'InputStateComponent')[0];
}

function tp(world: any, bx: number, by: number, e: number, n: number, alt: number) {
    const t = world.getComponent(player(world), 'TransformComponent') as TransformComponent;
    const [x, y, z] = world.metrics.septopusToEngine([e, n, alt], [bx, by]);
    t.position[0] = x;
    t.position[1] = y;
    t.position[2] = z;
    t.dirty = true;
}

describe('party royale block (Type 6: Party Royale & Fragile Floor Survival in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = partyRoyaleBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // arena safety walls
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThanOrEqual(6); // fragile floor tiles & champion island
        expect(adjuncts.find((g: any[]) => g[0] === 0x00ba)[1].length).toBe(1);             // 1 Referee NPC
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBeGreaterThanOrEqual(4); // collapse & victory triggers
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 guide book
    });

    it('plays through the fragile floor survival course: referee dialogue -> jump across falling tiles -> reach champion island & win trophy', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into continuous world
        engine.injectBlock({
            x: PARTY_BLOCK[0],
            y: PARTY_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: partyRoyaleBlock as any,
        });
        stepN(engine, 10);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // ── STEP 1: Talk to Referee NPC ──
        let refEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_186_0') refEid = eid;
        }
        expect(refEid, 'Referee NPC materialized').toBeGreaterThanOrEqual(0);

        tp(world, 2048, 2048, 9.5, 2.0, 8.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: refEid, actor: pEid });
        stepN(engine, 5);

        expect((world as any).activeDialogue, 'Referee dialogue active').toBeDefined();
        (world as any).chooseDialogue(0);
        stepN(engine, 5);
        expect((world as any).activeDialogue, 'Dialogue closed cleanly').toBeNull();
        expect(world.globalFlags['party_royale_joined']).toBe(true);

        // ── STEP 2: Leap onto Fragile Tile A ──
        // Tile A entity: adj_2048_2048_162_2
        let tileAEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_162_2') tileAEid = eid;
        }
        expect(tileAEid, 'Tile A found').toBeGreaterThanOrEqual(0);
        const tileATrans = world.getComponent<TransformComponent>(tileAEid, 'TransformComponent')!;
        const initialTileAY = tileATrans.position[1];

        tp(world, 2048, 2048, 5, 6, 7.5);
        stepN(engine, 10);

        expect(world.globalFlags['tile_a_collapsed'], 'Tile A triggered collapse').toBe(true);
        // Tile A moved down
        expect(tileATrans.position[1], 'Tile A dropped in altitude').toBeLessThan(initialTileAY);

        // ── STEP 3: Leap to Fragile Tile C (Mid-Tier) ──
        tp(world, 2048, 2048, 8, 9, 6.0);
        stepN(engine, 10);

        expect(world.globalFlags['tile_c_collapsed'], 'Tile C triggered collapse').toBe(true);

        // ── STEP 4: Touch Champion Island & Claim Trophy ──
        let champTriggerEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_184_3') champTriggerEid = eid;
        }
        expect(champTriggerEid, 'Champion trigger found').toBeGreaterThanOrEqual(0);

        tp(world, 2048, 2048, 8, 14.2, 3.6);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: champTriggerEid, actor: pEid });
        stepN(engine, 10);

        expect(world.globalFlags['party_royale_winner'], 'Champion flag set').toBe(true);
        const inv = world.getComponent<InventoryComponent>(pEid, 'InventoryComponent');
        const trophy = inv.items.find(i => i.id === 'tpl_1');
        expect(trophy?.quantity, 'Player received victory trophy').toBe(1);
    });

    it('void hazard eliminates players who fall off the fragile floor', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        engine.injectBlock({
            x: PARTY_BLOCK[0],
            y: PARTY_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: partyRoyaleBlock as any,
        });
        stepN(engine, 10);

        const pEid = player(world);

        // Player falls to bottom floor hazard area
        tp(world, 2048, 2048, 8, 8, 0.4);
        stepN(engine, 10);

        expect(world.globalFlags['party_royale_eliminated'], 'Player fell into void hazard and eliminated').toBe(true);
    });
});
