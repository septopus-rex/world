import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';
import { RenderEngine } from '../../src/render/RenderEngine';
import { MeshFactory } from '../../src/render/MeshFactory';

// Churn stress — the cross-system lifecycle debt left by the hardening batch:
// every SINGLE spawn/evict path is covered elsewhere (scheduler-spawn,
// render-dispose-guard); these tests assert nothing accumulates across MANY
// overlapping cycles — entities, scheduler tasks, shared mesh cache entries.
// A leak of one entry per cycle passes every single-shot test and still
// kills a long session; this is the test that would catch it.

const BX = 2048, BY = 2048;

describe('world churn — repeated inject→play→evict cycles stay bounded', () => {
    it('8 full cycles of spawner+NPC+combat leave zero residue each time', async () => {
        const engine = await makeHeadlessEngine();
        const world: any = engine.getWorld()!;
        const adjunctCount = () => world.getEntitiesWith(['AdjunctComponent']).length;
        const projectileCount = () => world.getEntitiesWith(['ProjectileComponent']).length;
        const schedBase = world.scheduler.pending;
        expect(adjunctCount()).toBe(0); // boot injects nothing (view() is null)

        const wanderDoc = { initial: 'w', states: { w: { move: { kind: 'wander', speed: 2, radius: 3 } } } };
        const brawlerDoc = {
            initial: 'idle', states: { idle: { move: { kind: 'stay' } } },
            onDeath: [{ type: 'spawn', target: '', method: '', params: [AdjunctType.Box, [[0.4, 0.4, 0.4], [0, 0, 0.2], [0, 0, 0], 3, [1, 1], 0, 0]] }],
        };
        const groups = [
            [AdjunctType.Box, [[[1, 1, 1], [12, 4, 0.5], [0, 0, 0], 0, [1, 1], 0, 0]]],
            [AdjunctType.Spawner, [[[8, 8, 0], [AdjunctType.Box, [[0.5, 0.5, 0.5], [1, 0, 1], [0, 0, 0], 2, [1, 1], 0, 0]], 0.5, 3, 1, 0]]],
            [AdjunctType.Npc, [
                [[8, 12, 0], { shape: 'box' }, brawlerDoc, 0, 10],   // damageable, drops loot
                [[4, 4, 0], { shape: 'box' }, wanderDoc, 3],          // invulnerable wanderer
            ]],
        ];
        const npcOf = (frag: string) => world.getEntitiesWith(['AdjunctComponent'])
            .map((eid: number) => ({ eid, a: world.getComponent(eid, 'AdjunctComponent') }))
            .find(({ a }: any) => String(a?.adjunctId ?? '').includes(frag));
        const player = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];

        for (let cycle = 0; cycle < 8; cycle++) {
            engine.injectBlock({ x: BX, y: BY, world: 'main', elevation: 0, adjuncts: [0, 1, groups, [], 1] });
            stepN(engine, 90); // ~1.5 s: behaviors attach, spawner fills toward maxAlive
            world.setMode(SystemMode.Game, true);
            const brawler = npcOf('_186_0')!;

            // One projectile that hits the player, one that expires mid-air…
            world.actuator.execute({ type: 'projectile', target: '', method: '', params: [{ speed: 12, damage: 2, ttl: 3 }] },
                { world, playerId: player, mode: world.mode, sourceEntity: brawler.eid });
            world.actuator.execute({ type: 'projectile', target: '', method: '', params: [{ speed: 5, damage: 1, ttl: 0.4, dir: [0, 1, 0] }] },
                { world, playerId: player, mode: world.mode, sourceEntity: brawler.eid });
            // …and a kill that runs the onDeath loot spawn (derived box at the corpse).
            world.actuator.execute({ type: 'damage', target: brawler.a.adjunctId, method: '', params: [15] },
                { world, playerId: player, mode: world.mode });
            stepN(engine, 45); // hit + expiry both resolve
            expect(projectileCount()).toBe(0);

            // A third projectile is STILL MID-FLIGHT when the block evicts (long ttl):
            // eviction, not ttl, must reap it.
            world.actuator.execute({ type: 'projectile', target: '', method: '', params: [{ speed: 3, damage: 1, ttl: 10, dir: [0, -1, 0] }] },
                { world, playerId: player, mode: world.mode, sourceEntity: npcOf('_186_1')!.eid });
            world.setMode(SystemMode.Normal, true);
            engine.removeBlock(BX, BY);
            stepN(engine, 3); // spawner disarm runs on the next update

            expect(adjunctCount(), `cycle ${cycle}: adjunct entity residue`).toBe(0);
            expect(projectileCount(), `cycle ${cycle}: projectile residue`).toBe(0);
            expect(world.scheduler.pending, `cycle ${cycle}: scheduler task residue`).toBe(schedBase);
        }
        // The player survived the ordeal (2 damage × 8 cycles) — no respawn mid-churn.
        expect(world.getComponent(player, 'HealthComponent').hp).toBeGreaterThan(0);
    });
});

describe('MeshFactory churn — shared caches return to baseline under volume', () => {
    const dispose = (obj: any) => (RenderEngine as any).disposeMeshResources(obj);
    const ro = (size: number[], color: number, texture?: string) => ({
        type: 'box',
        params: { size, position: [0, 0, 0], rotation: [0, 0, 0] },
        material: texture ? { color, texture } : { color },
    }) as any;
    // Sizes/colours unique to this file so entries from other suites never collide.
    const KEYS = [
        { size: [1.311, 2.117, 0.531], color: 0x131313 },
        { size: [0.913, 0.913, 3.171], color: 0x232323 },
        { size: [2.751, 0.397, 0.397], color: 0x343434 },
        { size: [0.577, 1.733, 1.733], color: 0x454545 },
    ];
    const TEX_SIZE = [0.7771, 0.7771, 0.7771];

    it('40 overlapping create/release cycles never grow the cache past one entry per key', () => {
        const base = MeshFactory.cacheStats();
        for (let cycle = 0; cycle < 40; cycle++) {
            const alive: THREE.Mesh[] = [];
            for (const k of KEYS) for (let u = 0; u < 4; u++)
                alive.push(MeshFactory.create(ro(k.size, k.color)) as THREE.Mesh);
            // Textured pair: shared geometry entry, fresh (uncached) materials.
            alive.push(MeshFactory.create(ro(TEX_SIZE, 0xffffff, '3')) as THREE.Mesh);
            alive.push(MeshFactory.create(ro(TEX_SIZE, 0xffffff, '3')) as THREE.Mesh);

            const grown = MeshFactory.cacheStats();
            expect(grown.geometries - base.geometries, `cycle ${cycle}`).toBe(5); // 4 colour keys + 1 textured
            expect(grown.materials - base.materials, `cycle ${cycle}`).toBe(4);   // colour materials only

            // Overlapping lifetimes, as neighbouring blocks have: release half
            // (dropping two keys to zero users mid-cycle), admit late users, release the rest.
            alive.splice(0, 8).forEach(dispose);
            alive.push(MeshFactory.create(ro(KEYS[0].size, KEYS[0].color)) as THREE.Mesh);
            alive.push(MeshFactory.create(ro(KEYS[3].size, KEYS[3].color)) as THREE.Mesh);
            alive.forEach(dispose);

            const end = MeshFactory.cacheStats();
            expect(end.geometries, `cycle ${cycle}: geometry cache didn't return to baseline`).toBe(base.geometries);
            expect(end.materials, `cycle ${cycle}: material cache didn't return to baseline`).toBe(base.materials);
        }
    });
});
