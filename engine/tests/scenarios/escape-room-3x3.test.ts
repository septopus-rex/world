import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import type { InventoryComponent } from '../../src/core/components/InventoryComponent';
import escapeRoom3x3Level from '../../../client/core/src/levels/escape_room_3x3.level.json';

// Register item catalog
registerDemoItems();

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

describe('3x3 Escape Room level (Multi-block cross-chamber puzzle playthrough)', () => {
    it('level structure verifies 9 interconnected blocks in 3x3 layout', () => {
        expect(escapeRoom3x3Level.blocks.length).toBe(9);
        const coords = escapeRoom3x3Level.blocks.map(b => `${b.x}_${b.y}`);
        for (let x = 2030; x <= 2032; x++) {
            for (let y = 2030; y <= 2032; y++) {
                expect(coords).toContain(`${x}_${y}`);
            }
        }
    });

    it('plays through the complete 3x3 multi-block escape room workflow', async () => {
        const { engine } = await makeHeadlessEngineWith({
            api: api(),
            playerStart: {
                block: [2030, 2030],
                position: [8, 4, 1.0],
                rotation: [0, 0, 0],
            },
        });
        const world = engine.getWorld()!;

        // Inject all 9 blocks of the 3x3 escape room level
        for (const blk of escapeRoom3x3Level.blocks) {
            engine.injectBlock({
                x: blk.x,
                y: blk.y,
                world: 'main',
                elevation: 0,
                adjuncts: blk.raw as any,
            });
        }
        stepN(engine, 10);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 5);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // ── STEP 1: Room (2030, 2030) - Entrance Hall NPC & Copper Key ──
        let npcEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2030_2030_186_0') npcEid = eid;
        }
        expect(npcEid, 'Entrance NPC found').toBeGreaterThanOrEqual(0);

        tp(world, 2030, 2030, 9.5, 4.5, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: npcEid, actor: pEid });
        stepN(engine, 5);
        expect((world as any).activeDialogue).toBeDefined();
        (world as any).chooseDialogue(0);
        stepN(engine, 5);

        // Pick up copper key in entrance hall
        let copperKeyEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2030_2030_181_0') copperKeyEid = eid;
        }
        expect(copperKeyEid, 'Copper key found').toBeGreaterThanOrEqual(0);
        tp(world, 2030, 2030, 8, 8, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: copperKeyEid, actor: pEid });
        stepN(engine, 5);

        // ── STEP 2: Cross border to Room (2031, 2030) - Trap Corridor & Gate ──
        tp(world, 2031, 2030, 12, 8, 1.0);
        stepN(engine, 10);
        expect(world.globalFlags['corridor_gate_open'], 'Corridor gate opened').toBe(true);

        // ── STEP 3: Cross border to Room (2032, 2030) - Water Chamber & Iron Key ──
        let valveEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2032_2030_184_0') valveEid = eid;
        }
        expect(valveEid, 'Water valve found').toBeGreaterThanOrEqual(0);

        tp(world, 2032, 2030, 13, 12, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: valveEid, actor: pEid });
        stepN(engine, 10);
        expect(world.globalFlags['water_drained'], 'Water drained').toBe(true);

        // Pick up iron key spawned in drained pool
        let ironKeyEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId.startsWith('adj_2032_2030_181_')) ironKeyEid = eid;
        }
        expect(ironKeyEid, 'Spawned iron key found').toBeGreaterThanOrEqual(0);
        tp(world, 2032, 2030, 8, 8, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: ironKeyEid, actor: pEid });
        stepN(engine, 5);

        // ── STEP 4: Room (2030, 2031) - Guard Barracks & Shadow Orb ──
        let guardEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2030_2031_186_0') guardEid = eid;
        }
        expect(guardEid, 'Guard NPC found').toBeGreaterThanOrEqual(0);

        tp(world, 2030, 2031, 8, 9.5, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: guardEid, actor: pEid });
        stepN(engine, 5);
        expect((world as any).activeDialogue).toBeDefined();
        (world as any).chooseDialogue(0);
        stepN(engine, 5);
        expect(world.globalFlags['guard_defeated'], 'Guard defeated').toBe(true);

        // Pick up shadow orb
        let orbEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId.startsWith('adj_2030_2031_181_')) orbEid = eid;
        }
        expect(orbEid, 'Spawned shadow orb found').toBeGreaterThanOrEqual(0);
        tp(world, 2030, 2031, 8, 9, 1.0);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: orbEid, actor: pEid });
        stepN(engine, 5);

        // ── STEP 5: Room (2030, 2032) - Floating Platforms & Skylight Lever ──
        tp(world, 2030, 2032, 6, 11, 4.0);
        stepN(engine, 10);
        expect(world.globalFlags['skylight_unlocked'], 'High skylight switch activated').toBe(true);

        // ── STEP 6: Room (2031, 2031) - Central Core Hub Activation ──
        let corePedestalEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2031_2031_184_0') corePedestalEid = eid;
        }
        expect(corePedestalEid, 'Core pedestal found').toBeGreaterThanOrEqual(0);

        tp(world, 2031, 2031, 8, 8, 1.2);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: corePedestalEid, actor: pEid });
        stepN(engine, 10);
        expect(world.globalFlags['central_core_active'], 'Central core activated and gate raised').toBe(true);

        // ── STEP 7: Room (2031, 2032) - Grand Escape Sanctum ──
        tp(world, 2031, 2032, 8, 10, 1.5);
        stepN(engine, 10);
        expect(world.globalFlags['escape_3x3_victory'], 'Grand 3x3 escape room victory!').toBe(true);
    });
});
