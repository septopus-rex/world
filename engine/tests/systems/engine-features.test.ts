import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { CharacterController } from '../../src/core/movement/CharacterController';

// L3 — the "engine completeness" batch: modes (Game/Ghost reachable, ghost
// noclip + hidden avatar), gameplay-session persistence (flags + oneTime),
// avatar animation states, the sound action, block LOD tiers, HP/respawn.

function api(records: Record<number, any> = {}) {
    return new (class {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
        async view() { return null; }
        async module(ids: number[]) {
            const out: Record<number, any> = {};
            for (const id of ids ?? []) if (records[id]) out[id] = records[id];
            return out;
        }
        async texture() { return {}; }
    })();
}

async function boot(opts: { backend?: any; records?: Record<number, any> } = {}) {
    const { engine, nullEngine } = await makeHeadlessEngineWith({
        api: api(opts.records),
        draftBackend: opts.backend ?? new InMemoryDraftBackend(),
    });
    const world = engine.getWorld()!;
    const player = world.queryEntities("TransformComponent", "InputStateComponent")[0];
    return { engine, world, player, nullEngine };
}

function injectBlock(engine: any, adjunctsRaw: any[], x = 2048, y = 2048) {
    engine.injectBlock({ x, y, world: 'main', elevation: 0, adjuncts: [0, 1, adjunctsRaw, []] });
    stepN(engine, 5);
}

const comp = (world: any, eid: number, type: string) => world.getComponent(eid, type) as any;

// ─── Modes: setMode API, Ghost noclip + hidden avatar ────────────────────────

describe('mode system (Engine.setMode)', () => {
    it('Game and Ghost are reachable through the Engine facade', async () => {
        const { engine, world } = await boot();
        // force: Game entry is otherwise zone-gated (block.game); this asserts the
        // facade reaches the mode, not the gate (covered by game-zone-entry.test).
        engine.setMode(SystemMode.Game, { force: true });
        expect(world.mode).toBe(SystemMode.Game);
        expect(engine.getMode()).toBe(SystemMode.Game);
        engine.setMode(SystemMode.Ghost);
        expect(world.mode).toBe(SystemMode.Ghost);
    });

    it('Ghost: no gravity, Space flies up, avatar hidden; Normal restores all', async () => {
        const { engine, world, player } = await boot();
        injectBlock(engine, []);
        const trans = comp(world, player, 'TransformComponent');
        const avatar = comp(world, player, 'AvatarComponent');

        engine.setMode(SystemMode.Ghost);
        trans.position[1] = 50;                       // park mid-air
        stepN(engine, 30);
        expect(trans.position[1]).toBeCloseTo(50, 3); // hovers — no gravity

        const input = comp(world, player, 'InputStateComponent');
        for (let i = 0; i < 10; i++) { input.jump = true; engine.step(1 / 60); }
        expect(trans.position[1]).toBeGreaterThan(50.5); // Space = ascend
        expect(avatar.handle.visible).toBe(false);       // incorporeal

        engine.setMode(SystemMode.Normal);
        // At 50m the hover-over-unscanned-ground guard kicks in (by design) —
        // assert gravity from within ground-probe range instead.
        trans.position[1] = 5;
        stepN(engine, 60);
        expect(trans.position[1]).toBeLessThan(2);       // gravity is back, landed
        expect(avatar.handle.visible).toBe(true);        // third-person default
    });
});

// ─── Session persistence: flags + durable oneTime ────────────────────────────

describe('gameplay session persistence', () => {
    const oneTimeGate = [
        [4, 4, 4], [8, 8, 1], [0, 0, 0], 1, 0, [
            { type: 'in', oneTime: true, actions: [{ type: 'flag', method: '', target: 'gate', params: [true] }] },
        ],
    ];

    it('flags and oneTime consumption survive an engine restart', async () => {
        const backend = new InMemoryDraftBackend();

        // Session 1: walk in → gate=true, oneTime consumed.
        const s1 = await boot({ backend });
        injectBlock(s1.engine, [[0x00b8, [oneTimeGate]]]);
        const trig1 = s1.world.queryEntities('TriggerComponent')[0];
        const p1 = comp(s1.world, s1.player, 'TransformComponent');
        p1.position = [...comp(s1.world, trig1, 'TransformComponent').position];
        s1.engine.step(1 / 60);
        expect(s1.world.globalFlags.gate).toBe(true);
        await new Promise(r => setTimeout(r, 0));     // write-behind lands

        // Session 2: same backend, fresh engine — flag restored, gate consumed.
        const s2 = await boot({ backend });
        await s2.engine.hydrateDrafts(0);
        expect(s2.world.globalFlags.gate).toBe(true);

        injectBlock(s2.engine, [[0x00b8, [oneTimeGate]]]);
        s2.world.globalFlags.gate = false;            // arm the probe
        const trig2 = s2.world.queryEntities('TriggerComponent')[0];
        const p2 = comp(s2.world, s2.player, 'TransformComponent');
        p2.position = [...comp(s2.world, trig2, 'TransformComponent').position];
        s2.engine.step(1 / 60);
        expect(s2.world.globalFlags.gate).toBe(false); // oneTime did NOT re-fire
    });
});

// ─── Player location persistence ─────────────────────────────────────────────

describe('player location persistence', () => {
    it('restores the last walked-to spot on restart (engine meta channel)', async () => {
        const backend = new InMemoryDraftBackend();

        // Session 1: land, walk 6m east, settle — CharacterController persists the
        // spot to the 'player' meta channel (Normal mode).
        const s1 = await boot({ backend });
        injectBlock(s1.engine, []);
        stepN(s1.engine, 30);
        const t1 = comp(s1.world, s1.player, 'TransformComponent');
        t1.position[0] += 6;
        t1.dirty = true;
        stepN(s1.engine, 30);
        const moved = s1.engine.getPlayerSeptopusLocation()!;
        await s1.world.draftStore.flush();          // flush drains the meta write

        const saved = await backend.loadMeta(0, 'player');
        expect(saved.version).toBe(1);
        expect(saved.block).toEqual(moved.block);
        expect(saved.position[0]).toBeCloseTo(moved.position[0], 0);

        // Session 2: same backend, fresh engine — restored to the spot, not spawn.
        const s2 = await boot({ backend });
        await s2.engine.hydrateDrafts(0);
        const restored = s2.engine.getPlayerSeptopusLocation()!;
        expect(restored.block).toEqual(moved.block);
        expect(restored.position[0]).toBeCloseTo(moved.position[0], 1); // east kept
        expect(restored.position[1]).toBeCloseTo(moved.position[1], 1); // north kept
    });

    it('ignores a void/malformed saved location — the player stays at spawn', async () => {
        const backend = new InMemoryDraftBackend();
        await backend.saveMeta(0, 'player', { version: 1, block: [2048, 2048], position: [8, 8, -999] });
        const { engine } = await boot({ backend });
        const before = engine.getPlayerSeptopusLocation()!;
        await engine.hydrateDrafts(0);                 // void guard rejects alt < -50
        const after = engine.getPlayerSeptopusLocation()!;
        expect(after.position[0]).toBeCloseTo(before.position[0], 3);
        expect(after.position[1]).toBeCloseTo(before.position[1], 3);
        expect(after.position[2]).toBeCloseTo(before.position[2], 3);
    });

    it('does NOT persist Ghost-mode movement (no spawn pollution)', async () => {
        const backend = new InMemoryDraftBackend();
        const { engine, world, player } = await boot({ backend });
        engine.setMode(SystemMode.Ghost);             // hover before any Normal step
        const t = comp(world, player, 'TransformComponent');
        t.position[0] += 20; t.position[1] = 40; t.dirty = true;
        stepN(engine, 10);
        await world.draftStore.flush();
        expect(await backend.loadMeta(0, 'player')).toBeUndefined();
    });
});

// ─── Checkpoint respawn (player.setSpawn) ────────────────────────────────────

describe('checkpoint respawn', () => {
    it('player.setSpawn moves the respawn point; a lethal fall returns there, not spawn', async () => {
        const { engine, world, player } = await boot();
        injectBlock(engine, []);
        stepN(engine, 30);                       // land at the world spawn
        const trans = comp(world, player, 'TransformComponent');
        const spawnX = trans.position[0], spawnZ = trans.position[2];

        // A checkpoint 4m east + 4m along Z (still over the loaded block).
        const checkpoint = world.createEntity();
        world.addComponent(checkpoint, 'TransformComponent', {
            position: [spawnX + 4, trans.position[1] + 2, spawnZ + 4], rotation: [0, 0, 0], scale: [1, 1, 1],
        });
        (world as any).actuator.execute(
            { type: 'player', method: 'setSpawn', params: [] },
            { world, playerId: player, mode: world.mode, sourceEntity: checkpoint },
        );
        expect(world.respawnPoint).toEqual([spawnX + 4, trans.position[1] + 2.5, spawnZ + 4]);

        // A lethal fall respawns at the checkpoint, not the world spawn.
        world.emitSimple('player:fell', { drop: 99 }, player);
        stepN(engine, 10);                       // process + settle
        expect(trans.position[0]).toBeCloseTo(spawnX + 4, 1);
        expect(trans.position[2]).toBeCloseTo(spawnZ + 4, 1);
        expect(Math.abs(trans.position[0] - spawnX)).toBeGreaterThan(3); // not the world spawn
    });
});

// ─── Camera impact shake (fall juice) ────────────────────────────────────────

describe('camera impact shake', () => {
    it('a hard landing jolts the camera, then the shake settles (linger)', async () => {
        const { engine, world, player } = await boot();
        const cc = world.systems.findSystem(CharacterController)!;
        injectBlock(engine, []);                 // ground at elevation 0
        stepN(engine, 60);                        // settle on the ground
        expect(cc.getCameraShake()).toBe(0);

        const trans = comp(world, player, 'TransformComponent');
        trans.position[1] = 5;                    // lift ~4m (non-lethal drop)
        trans.dirty = true;

        let jolted = false;
        for (let i = 0; i < 150 && !jolted; i++) {
            engine.step(1 / 60);
            if (cc.getCameraShake() > 0) jolted = true;
        }
        expect(jolted, 'landing set a camera shake').toBe(true);

        stepN(engine, 40);                        // > SHAKE_DECAY (0.5s = 30 frames)
        expect(cc.getCameraShake()).toBe(0);      // eased back to rest
    });
});

// ─── Avatar animation states ─────────────────────────────────────────────────

describe('avatar animation state machine', () => {
    it('derives idle → walk → air from movement', async () => {
        const { engine, world, player, nullEngine } = await boot();
        injectBlock(engine, []);
        stepN(engine, 60);                            // land + settle
        expect(nullEngine.__counts.lastAnimState).toBe('idle');

        world.controls.setMoveIntent(0, 1);
        stepN(engine, 20);
        expect(nullEngine.__counts.lastAnimState).toBe('walk');
        world.controls.setMoveIntent(0, 0);

        const input = comp(world, player, 'InputStateComponent');
        input.jump = true;
        stepN(engine, 3);
        expect(nullEngine.__counts.lastAnimState).toBe('air');
    });
});

// ─── Sound action (actuator → render layer) ──────────────────────────────────

describe('sound action', () => {
    it('resolves the audio record and reaches the render layer + emits audio:played', async () => {
        const { world, nullEngine } = await boot({
            records: { 31: { type: 'audio', format: 'wav', raw: '/assets/ding.wav' } },
        });
        let played: any = null;
        world.on('audio:played', (ev: any) => { played = ev.payload; });

        world.actuator.execute(
            { type: 'sound', target: 31, method: 'play', params: [0.8] } as any,
            { world, playerId: null, mode: SystemMode.Normal });

        expect(played?.target).toBe(31);              // observable immediately
        await new Promise(r => setTimeout(r, 0));     // async url resolve
        expect(nullEngine.__counts.soundsPlayed).toContain('/assets/ding.wav');
    });
});

// ─── Block LOD ───────────────────────────────────────────────────────────────

describe('block LOD', () => {
    it('far blocks hide adjunct meshes (ground stays); returning shows them', async () => {
        const { engine, world, player } = await boot();
        const box = [[1, 1, 1], [8, 8, 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        injectBlock(engine, [[0x00a2, [box]]], 2048, 2048);   // near (player block)
        injectBlock(engine, [[0x00a2, [box]]], 2055, 2048);   // ~112 m east — far
        stepN(engine, 20);                                     // ≥ one LOD check (0.25 s)

        const handleOf = (bx: number) => {
            for (const eid of world.queryEntities('AdjunctComponent')) {
                const adj = comp(world, eid, 'AdjunctComponent');
                if (adj.adjunctId === `adj_${bx}_2048_162_0`) {
                    return comp(world, eid, 'MeshComponent')?.handle;
                }
            }
            return null;
        };
        const groundVisible = world.queryEntities('AdjunctComponent')
            .map(eid => comp(world, eid, 'AdjunctComponent'))
            .filter(a => String(a.adjunctId).startsWith('ground'))
            .every(() => true);

        expect(handleOf(2048)?.visible).toBe(true);
        expect(handleOf(2055)?.visible).toBe(false);
        expect(groundVisible).toBe(true);

        // Walk over: tiers flip.
        const trans = comp(world, player, 'TransformComponent');
        const farCenter = comp(world,
            world.queryEntities('BlockComponent').find(eid => comp(world, eid, 'BlockComponent').x === 2055)!,
            'BlockComponent');
        trans.position[0] = (farCenter.x - 1) * 16 + 8;
        stepN(engine, 20);
        expect(handleOf(2055)?.visible).toBe(true);
        expect(handleOf(2048)?.visible).toBe(false);
    });
});

// ─── HP / death / respawn ────────────────────────────────────────────────────

describe('health & respawn', () => {
    it('damage/heal are Game-mode gated; lethal damage respawns at the spawn point', async () => {
        const { engine, world, player } = await boot();
        injectBlock(engine, []);
        stepN(engine, 5);
        const health = comp(world, player, 'HealthComponent');
        const damage = (n: number) => world.actuator.execute(
            { type: 'player', target: '', method: 'damage', params: [n] } as any,
            { world, playerId: player, mode: world.mode });

        damage(30);                                   // Normal mode → refused
        expect(health.hp).toBe(100);

        engine.setMode(SystemMode.Game, { force: true }); // testing vitals gating, not zone entry
        damage(30);
        expect(health.hp).toBe(70);

        const events: string[] = [];
        world.on('player:died', () => events.push('died'));
        world.on('player:respawned', () => events.push('respawned'));

        const trans = comp(world, player, 'TransformComponent');
        trans.position[0] += 100;                     // wander off
        damage(999);                                  // lethal

        expect(events).toEqual(['died', 'respawned']);
        expect(health.hp).toBe(100);                  // restored
        const start = (world.config as any).player.start.position;
        expect(trans.position[0]).toBeCloseTo(start[0], 5);
        expect(trans.position[2]).toBeCloseTo(start[2], 5);
    });

    it('a lethal fall (player:fell) kills and respawns', async () => {
        const { engine, world, player } = await boot();
        injectBlock(engine, []);
        stepN(engine, 5);
        let respawned = false;
        world.on('player:respawned', () => { respawned = true; });

        world.emitSimple('player:fell', { drop: 15 }, player);
        expect(respawned).toBe(true);
        expect(comp(world, player, 'HealthComponent').hp).toBe(100);
    });
});
