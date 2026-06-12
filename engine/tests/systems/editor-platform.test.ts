import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { EditTaskExecutor } from '../../src/core/EditTaskExecutor';
import { PLACEABLE_ADJUNCTS, defaultRawFor } from '../../src/core/edit/AdjunctDefaults';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { saveBlockDraft } from '../../src/core/utils/BlockSerializer';

// L3 — the creator loop (palette 'add' + undo) and moving-platform carry.

async function boot(adjunctsRaw: any[] = []) {
    const api = new (class {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
        async view() { return null; }
        async module() { return {}; }
        async texture() { return {}; }
    })();
    const { engine } = await makeHeadlessEngineWith({ api, draftBackend: new InMemoryDraftBackend() });
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, adjunctsRaw, []] });
    stepN(engine, 5);
    const world = engine.getWorld()!;
    const blockEid = world.queryEntities('BlockComponent')[0];
    const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return { engine, world, blockEid, player };
}

const comp = (world: any, eid: number, type: string) => world.getComponent(eid, type) as any;

// ─── palette defaults ────────────────────────────────────────────────────────

describe('AdjunctDefaults', () => {
    it('every placeable type produces a raw row its own codec can deserialize', () => {
        for (const { typeId, label } of PLACEABLE_ADJUNCTS) {
            const raw = defaultRawFor(typeId, [5, 6, 0]);
            expect(raw, label).not.toBeNull();
            const def = getBuiltinAdjunct(typeId)!;
            const std = def.attribute!.deserialize!(raw!);
            expect(std.ox, `${label} x`).toBe(5);
            expect(std.oy, `${label} y`).toBe(6);
        }
    });
});

// ─── editor 'add' action ─────────────────────────────────────────────────────

describe("EditTaskExecutor 'add' (palette placement)", () => {
    it('spawns the adjunct, persists in the draft, and undoes by deletion', async () => {
        const { engine, world, blockEid } = await boot();
        const executor = new EditTaskExecutor();
        const before = world.queryEntities('AdjunctComponent').length;

        const task: any = {
            entityId: -1, adjunct: '', action: 'add',
            param: { typeId: 0x00a2, blockEntityId: blockEid, raw: defaultRawFor(0x00a2, [5, 6, 0]) },
        };
        const result = executor.execute(world, task);

        expect(result.success).toBe(true);
        expect(task.entityId).toBeGreaterThanOrEqual(0);       // spawned eid written back
        expect(world.queryEntities('AdjunctComponent').length).toBe(before + 1);
        const adj = comp(world, task.entityId, 'AdjunctComponent');
        expect(adj.stdData.typeId).toBe(0x00a2);
        expect(adj.stdData.ox).toBe(5);

        stepN(engine, 2);                                       // AdjunctSystem builds the mesh
        expect(comp(world, task.entityId, 'MeshComponent')?.handle).toBeTruthy();

        // The creator's work survives: serialize → draft contains the new box.
        saveBlockDraft(world, blockEid);
        const draft = world.draftStore.load(0, 2048, 2048)!;
        const boxGroup = draft.raw[2].find((g: any[]) => g[0] === 0x00a2);
        expect(boxGroup[1].some((row: any[]) => row[1][0] === 5 && row[1][1] === 6)).toBe(true);

        // Undo of an 'add' = delete the spawned entity.
        expect(executor.restore(world, task.entityId, result.snapshot!)).toBe(true);
        expect(world.queryEntities('AdjunctComponent').length).toBe(before);
    });

    it('placing a trigger yields a live TriggerComponent next frame', async () => {
        const { engine, world, blockEid } = await boot();
        const executor = new EditTaskExecutor();
        const raw = defaultRawFor(0x00b8, [8, 8, 0])!;
        raw[5] = [{ type: 'in', actions: [{ type: 'flag', method: '', target: 'placed_gate', params: [true] }] }];

        const task: any = { entityId: -1, adjunct: '', action: 'add', param: { typeId: 0x00b8, blockEntityId: blockEid, raw } };
        expect(executor.execute(world, task).success).toBe(true);
        stepN(engine, 2);

        const trig = comp(world, task.entityId, 'TriggerComponent');
        expect(trig).toBeTruthy();
        expect(trig.events[0].actions[0].target).toBe('placed_gate');
    });
});

// ─── moving-platform carry ───────────────────────────────────────────────────

describe('moving-platform carry', () => {
    /** A standable platform: stop=1 box, top surface at SPP alt 2.5. */
    const platformRaw = [[2, 2, 1], [8, 8, 2], [0, 0, 0], 0, [1, 1], 0, 1];

    async function bootOnPlatform() {
        const { engine, world, player } = await boot([[0x00a2, [platformRaw]]]);
        // The platform adjunct entity (not the auto-ground).
        const platEid = world.queryEntities('AdjunctComponent').find(eid => {
            const a = comp(world, eid, 'AdjunctComponent');
            return !String(a.adjunctId).startsWith('ground');
        })!;
        const plat = comp(world, platEid, 'TransformComponent');
        const pTrans = comp(world, player, 'TransformComponent');
        // Drop the player onto the platform top and settle. (Standing on the
        // platform = body center at top + half body height: 2.5 + 0.9.)
        pTrans.position[0] = plat.position[0];
        pTrans.position[1] = plat.position[1] + 0.5 + 1.2;
        pTrans.position[2] = plat.position[2];
        stepN(engine, 30);
        expect(pTrans.position[1]).toBeCloseTo(plat.position[1] + 0.5 + 0.9, 1);
        return { engine, world, plat, pTrans };
    }

    it('rides a vertically moving platform (trigger moveZ semantics)', async () => {
        const { engine, plat, pTrans } = await bootOnPlatform();
        const y0 = pTrans.position[1];

        plat.position[1] += 0.8;          // instant lift, exactly like actuator moveZ
        plat.dirty = true;
        stepN(engine, 3);

        expect(pTrans.position[1]).toBeGreaterThan(y0 + 0.6);   // carried up
    });

    it('follows horizontal platform motion instead of sliding off', async () => {
        const { engine, plat, pTrans } = await bootOnPlatform();
        const x0 = pTrans.position[0];

        for (let i = 0; i < 10; i++) {     // continuous mover, 0.05 m/frame
            plat.position[0] += 0.05;
            plat.dirty = true;
            engine.step(1 / 60);
        }
        expect(pTrans.position[0]).toBeCloseTo(x0 + 0.5, 1);
    });

    it('solid cache follows moved adjuncts (no ghost collision at the old pose)', async () => {
        // A wall blocks the player's path north; a trigger-style instant lift
        // must open the passage IMMEDIATELY — the old count-keyed cache kept
        // colliding at the stale pose until block streaming happened to rebuild.
        const wallRaw = [[4, 0.4, 3], [8, 10, 1.5], [0, 0, 0], 0, [1, 1], 0, 1];
        const { engine, world, player } = await boot([[0x00a1, [wallRaw]]]);
        const wallEid = world.queryEntities('AdjunctComponent').find(eid => {
            const a = comp(world, eid, 'AdjunctComponent');
            return !String(a.adjunctId).startsWith('ground');
        })!;
        const wall = comp(world, wallEid, 'TransformComponent');
        const pTrans = comp(world, player, 'TransformComponent');
        stepN(engine, 30);                              // land at spawn [8,8]

        // Walk north into the wall: blocked.
        world.controls.setMoveIntent(0, 1);
        stepN(engine, 40);
        const blockedZ = pTrans.position[2];
        expect(blockedZ).toBeGreaterThan(wall.position[2] + 0.3); // stopped south of it

        // Lift the wall out of the way (actuator moveZ semantics) and keep walking.
        wall.position[1] += 10;
        wall.dirty = true;
        stepN(engine, 60);
        world.controls.setMoveIntent(0, 0);
        expect(pTrans.position[2]).toBeLessThan(wall.position[2] - 0.5); // walked THROUGH
    });
});

// ─── PR-3: block.loaded fires once per block ─────────────────────────────────

describe('block.loaded (PR-3)', () => {
    it('emits exactly once, when the LAST adjunct mesh lands', async () => {
        const api = new (class {
            async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
            async view() { return null; }
            async module() { return {}; }
            async texture() { return {}; }
        })();
        const { engine } = await makeHeadlessEngineWith({ api, draftBackend: new InMemoryDraftBackend() });
        const world = engine.getWorld()!;
        const reader = world.events.reader('block.loaded');

        const box = [[1, 1, 1], [8, 8, 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        engine.injectBlock({
            x: 2048, y: 2048, world: 'main', elevation: 0,
            adjuncts: [0, 1, [[0x00a2, [box, box]]], []],
        });
        // Read every frame (events live exactly 2 beginFrames — consumer contract).
        const events: any[] = [];
        for (let i = 0; i < 10; i++) { engine.step(1 / 60); events.push(...reader.read()); }

        expect(events).toHaveLength(1);                          // ONE per block
        expect((events[0].payload as any).adjunctCount).toBe(3); // 2 boxes + ground
        expect(events[0].targetKey).toBe('blk:2048_2048');
    });
});
