import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';
import holdemBlock from '../../../client/core/src/blocks/holdem.block.json';

// A prominent, discoverable entrance for the hold'em table: a static post (a2)
// topped by a slowly-spinning gold ball (a7, SignSpin animation) with a
// stationary dialogue anchor (ba npc) co-located at the same spot — clicking
// it shows a description + "进入游戏" button, which fires the SAME
// player.enterGame action the corner UI button/walk-in triggers use. This
// covers the DATA + actuator wiring headlessly; real render/click verified
// separately would need a browser (see splat-module.spec.ts for that tier).

function findByTypeId(world: any, typeId: number): any[] {
    return world.getEntitiesWith(['AdjunctComponent'])
        .filter((id: any) => world.getComponent(id, 'AdjunctComponent')?.stdData?.typeId === typeId);
}

async function boot() {
    // Default test spawn [8,8,1] sits inside the actual poker table's geometry
    // (centered on the same spot) — spawn off to a clear corner instead so the
    // embed-rescue guard doesn't fire (harmless, but noisy/irrelevant here).
    const engine = await makeHeadlessEngine({ block: [2048, 2048], position: [3, 3, 1], rotation: [0, 0, 0] });
    const world: any = engine.getWorld()!;
    const raw = holdemBlock as any;
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: raw[0], adjuncts: raw });
    stepN(engine, 5);
    return { engine, world };
}

describe('holdem entrance: rotating sign (a7) + dialogue anchor (ba npc) → enterGame', () => {
    it('the rotating cap spins around the VERTICAL axis (Septopus Z), not BatonSpin\'s horizontal Y', async () => {
        const { world } = await boot();
        const ballIds = findByTypeId(world, AdjunctType.Ball);
        expect(ballIds.length).toBe(1);
        const anim = world.getComponent(ballIds[0], 'AnimationComponent');
        expect(anim?.config?.timeline?.[0]?.axis).toBe('Z');
        expect(anim?.config?.loops).toBe(0); // infinite
    });

    it('the dialogue anchor is a single stationary npc whose "进入游戏" option carries enterGame + lockMovement', async () => {
        const { world } = await boot();
        const npcIds = findByTypeId(world, AdjunctType.Npc);
        expect(npcIds.length).toBe(1);

        const npc = world.getComponent(npcIds[0], 'AdjunctComponent');
        expect(npc.stdData.behavior?.states?.idle?.move?.kind).toBe('stay'); // never wanders off

        const dialogue = npc.stdData.dialogue;
        const opt = dialogue.nodes[dialogue.start].options.find((o: any) => o.label === '进入游戏');
        expect(opt.actions).toEqual([
            { type: 'player', method: 'enterGame', params: [{ lockMovement: true }] },
        ]);
    });

    it('choosing "进入游戏" through the actuator (as DialogueSystem would) enters Game mode with movement locked', async () => {
        const { world } = await boot();
        const npcIds = findByTypeId(world, AdjunctType.Npc);
        const npc = world.getComponent(npcIds[0], 'AdjunctComponent');
        const opt = npc.stdData.dialogue.nodes.intro.options[0];
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];

        expect(world.gameZoneActive).toBe(true); // standing on the holdem table's block.game

        for (const action of opt.actions) {
            world.actuator.execute(action, { world, playerId: player, mode: world.mode, sourceEntity: npcIds[0] });
        }

        expect(world.mode).toBe(SystemMode.Game);
        expect(world.moveLocked).toBe(true); // same mechanism verified in systems/game-zone-entry.test.ts
    });
});
