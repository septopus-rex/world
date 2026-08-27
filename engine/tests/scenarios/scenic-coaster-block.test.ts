import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import scenicCoasterBlock from '../../../client/core/src/blocks/scenic_coaster.block.json';

// Register item catalog
registerDemoItems();

const COASTER_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: COASTER_BLOCK,
    position: [8, 1, 0.5] as [number, number, number],
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

describe('scenic coaster block (Type 5: Scenic Coaster & Museum in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = scenicCoasterBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // perimeter & obelisk
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // platform & altars
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b6)[1].length).toBe(1);             // 1 SPP coaster track
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBe(1);             // 1 boarding trigger
        expect(adjuncts.find((g: any[]) => g[0] === 0x00ba)[1].length).toBe(1);             // 1 station attendant NPC
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 guide book
    });

    it('plays through the scenic coaster tour: attendant dialogue -> board coaster -> kinematic tour -> tour complete', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into the continuous world
        engine.injectBlock({
            x: COASTER_BLOCK[0],
            y: COASTER_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: scenicCoasterBlock as any,
        });
        stepN(engine, 10);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // ── STEP 1: Talk to Station Attendant NPC ──
        let attendantEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_186_0') attendantEid = eid;
        }
        expect(attendantEid, 'Attendant NPC materialized').toBeGreaterThanOrEqual(0);

        tp(world, 2048, 2048, 7.5, 2.0, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: attendantEid, actor: pEid });
        stepN(engine, 5);

        expect((world as any).activeDialogue, 'Attendant dialogue active').toBeDefined();
        (world as any).chooseDialogue(0);
        stepN(engine, 5);
        expect((world as any).activeDialogue, 'Dialogue closed').toBeNull();

        // ── STEP 2: Step onto Coaster Boarding Platform -> enterGame ──
        expect(world.mode).toBe(SystemMode.Normal);
        expect(world.rideActive).toBe(false);

        tp(world, 2048, 2048, 4, 4, 1.5);
        stepN(engine, 10);

        // Transitioned to Game mode & rideActive
        expect(world.mode, 'Entered Game mode').toBe(SystemMode.Game);
        expect(world.globalFlags['coaster_started'], 'Coaster started flag set').toBe(true);
        expect(world.rideActive, 'Ride is now active on track').toBe(true);

        const t = world.getComponent(pEid, 'TransformComponent') as TransformComponent;
        const initialZ = t.position[2];

        // ── STEP 3: Kinematic coaster rides along the rail ──
        // Step 60 frames (1 second) -> cart moves along track
        stepN(engine, 60);

        expect(world.rideActive).toBe(true);
        const midZ = t.position[2];
        // Cart moved along track in North direction (-Z)
        expect(midZ).not.toBe(initialZ);

        // Ride through entire loop (approx 5-8 seconds = 360-480 frames)
        stepN(engine, 400);

        // Reaching the end sets coaster_complete
        expect(world.globalFlags['coaster_complete'], 'Scenic tour completed').toBe(true);
    });
});
