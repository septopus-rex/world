import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import shootingGalleryBlock from '../../../client/core/src/blocks/shooting_gallery.block.json';

// Register item catalog
registerDemoItems();

const GALLERY_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: GALLERY_BLOCK,
    position: [8, 2, 0.5] as [number, number, number],
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

describe('shooting gallery block (Type 4: Shooting Gallery & Wave Defense in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = shootingGalleryBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // walls / partitions
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // floor / booth counter
        expect(adjuncts.find((g: any[]) => g[0] === 0x00ba)[1].length).toBe(1);             // 1 Range master NPC
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBe(1);             // 1 enterGame trigger
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 guide book
    });

    it('plays through the shooting gallery: talk to NPC -> step onto shooting booth -> enter Game mode -> hit targets -> score and reaction', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into the continuous world
        engine.injectBlock({
            x: GALLERY_BLOCK[0],
            y: GALLERY_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: shootingGalleryBlock as any,
        });
        stepN(engine, 10);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // ── STEP 1: Talk to Range Master NPC ──
        let masterEid = -1;
        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_186_0') masterEid = eid;
        }
        expect(masterEid, 'Master NPC materialized').toBeGreaterThanOrEqual(0);

        tp(world, 2048, 2048, 11, 4.5, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: masterEid, actor: pEid });
        stepN(engine, 5);

        expect((world as any).activeDialogue, 'Dialogue opened').toBeDefined();
        (world as any).chooseDialogue(0);
        stepN(engine, 5);
        expect((world as any).activeDialogue, 'Dialogue closed cleanly').toBeNull();

        // ── STEP 2: Step onto Shooting Booth (Trigger -> enterGame) ──
        expect(world.mode).toBe(SystemMode.Normal);
        tp(world, 2048, 2048, 8, 4.5, 0.5);
        stepN(engine, 10);

        // Mode has automatically transitioned to Game mode via trigger enterGame
        expect(world.mode, 'Entered Game mode').toBe(SystemMode.Game);
        expect(world.globalFlags['shooting_gallery_active']).toBe(true);

        // ShootingRangeSystem spawned target spheres
        const st = engine.shootingState();
        expect(st, 'Shooting state initialized').toBeDefined();
        expect(st.targetCount).toBe(5);
        expect(st.targets.length).toBe(5);
        expect(st.targets.every((t: any) => t.state === 'up'), 'All 5 targets are active up').toBe(true);

        // ── STEP 3: Aim and Shoot at Targets ──
        // Shoot target 0
        const res0 = engine.shootingFire(0);
        expect(res0).toBe('hit');

        // Shoot target 2
        const res2 = engine.shootingFire(2);
        expect(res2).toBe('hit');

        stepN(engine, 5);
        const stAfterHits = engine.shootingState();
        expect(stAfterHits.hits).toBe(2);
        expect(stAfterHits.shots).toBe(2);
        expect(stAfterHits.score).toBe(2);
        expect(stAfterHits.targets[0].state).toBe('hit');
        expect(stAfterHits.targets[2].state).toBe('hit');

        // Step past litTime (1.0s = 60 frames) -> targets re-arm to 'up'
        stepN(engine, 70);
        const stRearmed = engine.shootingState();
        expect(stRearmed.targets[0].state, 'Target 0 re-armed').toBe('up');
        expect(stRearmed.targets[2].state, 'Target 2 re-armed').toBe('up');
    });
});
