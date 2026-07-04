import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';

// The two RPG combat verbs added for the data-driven (Pattern C) RPG:
//   • ATTACK (ba slot 6 `interact`): clicking a non-talkable agent runs its
//     authored actions — `damage target:'self'` = "the player's hit lands on
//     me"; cooldown-gated so click-spam can't machine-gun.
//   • CONTACT DAMAGE (ba slot 7 `touch`): the bite follows the LIVE body via
//     the distToPlayer NPCSystem already derives — a `follow` chaser damages
//     whoever it catches, on an interval, through the Game-gated damage channel.
// Death closes the loop: onDeath spawns a b5 loot drop (zero new primitives).

const BX = 2048, BY = 2048;

const WOLF_ROW = [
    [8, 10, 0],                                          // home: 2 m north of spawn
    { shape: 'box', size: [0.8, 0.8, 1.2], color: 0x884444 },
    {
        initial: 'lurk',
        states: {
            lurk: { move: { kind: 'stay' }, transitions: [{ when: { '<': [{ var: 'npc.distToPlayer' }, 6] }, to: 'chase' }] },
            chase: { move: { kind: 'follow', speed: 2.5, stopAt: 0.8 }, transitions: [{ when: { '>': [{ var: 'npc.distToPlayer' }, 12] }, to: 'lurk' }] },
        },
        onDeath: [
            { type: 'spawn', params: [AdjunctType.Item, [[0, 0, 0.5], 3, 7, 1]] }, // herb (Potion tpl 3)
            { type: 'flag', target: 'wolf_slain', params: [true] },
        ],
    },
    5,                                                   // seed
    50,                                                  // hp — two hits of 25
    null,                                                // no dialogue → attackable
    { cooldown: 0.4, actions: [{ type: 'damage', target: 'self', params: [25] }] },
    { damage: 10, interval: 0.5, radius: 1.5 },
];

async function bootWolf() {
    const engine = await makeHeadlessEngine();
    const world: any = engine.getWorld()!;
    engine.injectBlock({
        x: BX, y: BY, world: 'main', elevation: 0,
        adjuncts: [0, 1, [[AdjunctType.Npc, [WOLF_ROW]]], [], 1], // game bit set
    });
    stepN(engine, 5);
    const playerId = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const npcEid = world.getEntitiesWith(['AdjunctComponent']).find((e: number) =>
        world.getComponent(e, 'AdjunctComponent')?.stdData?.typeId === AdjunctType.Npc);
    const behavior = () => world.getComponent(npcEid, 'BehaviorComponent');
    const click = (distance = 1.5) => {
        world.events.emit('interact.primary', { metadata: null, distance, point: [0, 0, 0] },
            { target: npcEid, actor: playerId });
    };
    return { engine, world, playerId, npcEid, behavior, click };
}

describe('attack verb — interact slot on a non-talkable agent', () => {
    it('clicks damage through the actuator; cooldown blocks spam; death drops loot + flag', async () => {
        const { engine, world, behavior, click } = await bootWolf();
        world.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        expect(behavior().hp).toBe(50);

        // Two clicks in the SAME frame: cooldown lets only the first land.
        click(); click();
        stepN(engine, 2);
        expect(behavior().hp).toBe(25);

        // After the 0.4 s cooldown, the second hit lands → death.
        stepN(engine, 30); // 0.5 s
        click();
        stepN(engine, 2);
        expect(behavior().dead).toBe(true);
        expect(world.globalFlags.wolf_slain).toBe(true);

        // Loot: one derived b5 herb spawned at the corpse.
        const items = world.getEntitiesWith(['ItemComponent']);
        expect(items.length).toBe(1);

        // Corpse is inert: further clicks do nothing.
        stepN(engine, 30);
        click();
        stepN(engine, 2);
        expect(behavior().hp).toBeLessThanOrEqual(0);
    });

    it('attack verb is Game-gated: clicks in Normal mode do not damage', async () => {
        const { engine, behavior, click } = await bootWolf();
        click();
        stepN(engine, 2);
        expect(behavior().hp).toBe(50); // actuator refused damage outside Game
    });
});

describe('contact damage — touch slot follows the live body', () => {
    it('a chasing agent bites on its interval; no touch outside Game mode', async () => {
        const { engine, world, playerId } = await bootWolf();
        const hp = () => world.getComponent(playerId, 'HealthComponent')?.hp;
        const before = hp();

        // Normal mode, standing at spawn 2 m from the wolf's home: it may chase
        // and reach us, but the bite must not land outside Game.
        stepN(engine, 120);
        expect(hp()).toBe(before);

        world.setMode(SystemMode.Game, { force: true });
        stepN(engine, 150); // 2.5 s — chase (2.5 m/s) + ≥2 bite intervals (0.5 s)
        expect(hp()).toBeLessThan(before);
        const afterTwo = hp();

        // Interval paces the damage: another 0.5 s ≈ exactly one more bite.
        stepN(engine, 30);
        expect(before - hp()).toBeGreaterThan(before - afterTwo); // strictly more
        expect((afterTwo - hp()) % 10).toBe(0);                    // whole 10-dmg bites
    });
});
