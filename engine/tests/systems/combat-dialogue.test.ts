import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';

// F3 combat (spec combat-damage.md) + F4 dialogue (spec dialogue-quests.md),
// through the real engine loop.

const BX = 2048, BY = 2048;

async function boot(groups: any[]) {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;
    engine.injectBlock({ x: BX, y: BY, world: 'main', elevation: 0, adjuncts: [0, 1, groups, [], 1] });
    stepN(engine, 4);
    return { engine, world };
}
function npcByFrag(world: any, frag: string) {
    return world.getEntitiesWith(['AdjunctComponent'])
        .map((eid: number) => ({ eid, a: world.getComponent(eid, 'AdjunctComponent') }))
        .find(({ a }: any) => String(a?.adjunctId ?? '').includes(frag)) ?? null;
}
function playerOf(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}
const beh = (world: any, eid: number) => world.getComponent(eid, 'BehaviorComponent') as any;

const idleDoc = { initial: 'idle', states: { idle: { move: { kind: 'stay' } } } };

describe('F3 · damage action', () => {
    it('damages an NPC; death runs onDeath (loot spawn) and hides the authored agent', async () => {
        const doc = {
            ...idleDoc,
            onDeath: [{ type: 'spawn', target: '', method: '', params: [AdjunctType.Box, [[0.4, 0.4, 0.4], [0, 0, 0.2], [0, 0, 0], 3, [1, 1], 0, 0]] }],
        };
        const { engine, world } = await boot([[AdjunctType.Npc, [[[8, 8, 0], { shape: 'box' }, doc, 0, 20]]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2); // behavior attaches
        world.setMode(SystemMode.Game, true);

        world.actuator.execute({ type: 'damage', target: npc.a.adjunctId, method: '', params: [15] },
            { world, playerId: playerOf(world), mode: world.mode });
        expect(beh(world, npc.eid).hp).toBe(5);
        expect(beh(world, npc.eid).dead).toBe(false);

        world.actuator.execute({ type: 'damage', target: npc.a.adjunctId, method: '', params: [15] },
            { world, playerId: playerOf(world), mode: world.mode });
        const b = beh(world, npc.eid);
        expect(b.dead).toBe(true);
        // Authored agent is KEPT (hidden) — a draft save must not lose its row.
        expect(world.getComponent(npc.eid, 'AdjunctComponent')).toBeTruthy();
        // onDeath loot: a derived box spawned at the corpse.
        const loot = world.getEntitiesWith(['AdjunctComponent'])
            .map((eid: number) => world.getComponent<any>(eid, 'AdjunctComponent'))
            .filter((a: any) => a?.stdData?.derivedFrom === npc.a.adjunctId);
        expect(loot.length).toBe(1);
    });

    it('damage is refused outside Game mode; invulnerable (hp 0) NPCs shrug it off', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [
            [[4, 4, 0], { shape: 'box' }, idleDoc, 0, 10],   // damageable
            [[12, 12, 0], { shape: 'box' }, idleDoc, 0],      // no hp slot → invulnerable
        ]]]);
        stepN(engine, 2);
        const a = npcByFrag(world, '_186_0')!;
        const b = npcByFrag(world, '_186_1')!;

        // Normal mode → ignored.
        world.actuator.execute({ type: 'damage', target: a.a.adjunctId, method: '', params: [5] },
            { world, playerId: playerOf(world), mode: world.mode });
        expect(beh(world, a.eid).hp).toBe(10);

        world.setMode(SystemMode.Game, true);
        world.actuator.execute({ type: 'damage', target: b.a.adjunctId, method: '', params: [50] },
            { world, playerId: playerOf(world), mode: world.mode });
        expect(beh(world, b.eid).dead).toBe(false); // invulnerable
    });

    it('damage target player routes into HealthSystem', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [[[8, 8, 0], { shape: 'box' }, idleDoc, 0]]]]);
        stepN(engine, 2);
        world.setMode(SystemMode.Game, true);
        const player = playerOf(world);
        const hp0 = world.getComponent<any>(player, 'HealthComponent').hp;
        world.actuator.execute({ type: 'damage', target: 'player', method: '', params: [12] },
            { world, playerId: player, mode: world.mode });
        stepN(engine, 2);
        expect(world.getComponent<any>(player, 'HealthComponent').hp).toBe(hp0 - 12);
    });
});

describe('F3 · projectile', () => {
    it('flies straight at the player and damages on hit, then self-destructs', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [[[8, 12, 0], { shape: 'box' }, idleDoc, 0]]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2);
        world.setMode(SystemMode.Game, true);
        const player = playerOf(world);
        const hp0 = world.getComponent<any>(player, 'HealthComponent').hp;

        world.actuator.execute({ type: 'projectile', target: '', method: '', params: [{ speed: 10, damage: 7, ttl: 3 }] },
            { world, playerId: player, mode: world.mode, sourceEntity: npc.eid });
        expect(world.getEntitiesWith(['ProjectileComponent'])).toHaveLength(1);

        stepN(engine, 90); // 1.5s at 10 m/s covers the few metres to the player
        expect(world.getComponent<any>(player, 'HealthComponent').hp).toBe(hp0 - 7);
        expect(world.getEntitiesWith(['ProjectileComponent'])).toHaveLength(0); // gone on hit
    });

    it('expires at ttl without a hit (fired away from everyone)', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [[[8, 8, 0], { shape: 'box' }, idleDoc, 0]]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2);
        world.setMode(SystemMode.Game, true);
        world.actuator.execute({ type: 'projectile', target: '', method: '', params: [{ speed: 5, damage: 5, ttl: 0.5, dir: [0, 1, 0] }] },
            { world, playerId: playerOf(world), mode: world.mode, sourceEntity: npc.eid });
        expect(world.getEntitiesWith(['ProjectileComponent'])).toHaveLength(1);
        stepN(engine, 45); // 0.75s > ttl
        expect(world.getEntitiesWith(['ProjectileComponent'])).toHaveLength(0);
    });
});

describe('F4 · dialogue', () => {
    const dialogue = {
        start: 'hello',
        nodes: {
            hello: {
                text: 'Greetings.',
                options: [
                    { label: 'Shop', to: 'shop' },
                    { label: 'Secret', when: { '>=': [{ var: 'inventory.tpl_2' }, 1] }, to: 'secret' },
                    { label: 'Bye', actions: [{ type: 'flag', target: 'met_npc', method: '', params: [true] }], to: null },
                ],
            },
            shop: { text: 'Wares.', options: [{ label: 'Back', to: 'hello' }] },
            secret: { text: 'The cellar.', options: [{ label: '…', to: null }] },
        },
    };
    const npcRow = [[8, 8, 0], { shape: 'box' }, idleDoc, 0, 0, dialogue];

    /** Click the NPC via the same channel RaycastInteraction uses. */
    function talkTo(world: any, eid: number) {
        world.events.emit('interact.primary', { distance: 2 }, { target: eid });
    }

    it('interact starts the dialogue; conditional options are filtered; choose walks + ends', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [npcRow]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2);

        talkTo(world, npc.eid);
        stepN(engine, 2);
        const d = world.activeDialogue!;
        expect(d).toBeTruthy();
        expect(d.nodeId).toBe('hello');
        expect(d.visible).toEqual([0, 2]); // 'Secret' hidden — no key in inventory

        world.chooseDialogue(0); // 'Shop'
        expect(world.activeDialogue!.nodeId).toBe('shop');
        world.chooseDialogue(0); // 'Back'
        expect(world.activeDialogue!.nodeId).toBe('hello');

        world.chooseDialogue(1); // visible index 1 = 'Bye' → actions + end
        expect(world.activeDialogue).toBeNull();
        expect(world.globalFlags.met_npc).toBe(true);
    });

    it('a key in the bag reveals the conditional option (quest-via-flags recipe)', async () => {
        const { engine, world } = await boot([[AdjunctType.Npc, [npcRow]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2);
        const player = playerOf(world);
        const inv = world.getComponent<any>(player, 'InventoryComponent');
        inv.items.push({ id: 'tpl_2', quantity: 1 });

        talkTo(world, npc.eid);
        stepN(engine, 2);
        expect(world.activeDialogue!.visible).toEqual([0, 1, 2]); // all three now
        world.chooseDialogue(1); // 'Secret'
        expect(world.activeDialogue!.nodeId).toBe('secret');
        world.endDialogue();
        expect(world.activeDialogue).toBeNull();
    });

    it('the conversation partner holds still while talking', async () => {
        const wanderDoc = { initial: 'w', states: { w: { move: { kind: 'wander', speed: 2, radius: 4 } } } };
        const row = [[8, 8, 0], { shape: 'box' }, wanderDoc, 3, 0, dialogue];
        const { engine, world } = await boot([[AdjunctType.Npc, [row]]]);
        const npc = npcByFrag(world, '_186_0')!;
        stepN(engine, 2);
        talkTo(world, npc.eid);
        stepN(engine, 2);
        const p0 = [...world.getComponent<any>(npc.eid, 'TransformComponent').position];
        stepN(engine, 60);
        expect(world.getComponent<any>(npc.eid, 'TransformComponent').position).toEqual(p0); // frozen mid-chat
        world.endDialogue();
        stepN(engine, 60);
        expect(world.getComponent<any>(npc.eid, 'TransformComponent').position).not.toEqual(p0); // resumes
    });
});
