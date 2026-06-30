import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { serializeBlockToRaw } from '../../src/core/utils/BlockSerializer';

// Game-mode entry is ZONE-GATED on the block-level `game` flag (raw[4]), the
// single, explicit, on-chain-queryable signal that any interpreter reads off
// the block data (no adjunct scan) to decide where Game mode may be entered —
// the new-engine successor to the old engine's BLOCK_INDEX_GAME_SETTING.
// Contract: docs/systems/game-mode-entry.md.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

/** Boot headless (default spawn block [2048,2048]) and inject that block with the
 *  given game flag (raw[4]). */
async function bootInBlock(game: number) {
    const { engine } = await makeHeadlessEngineWith({ api: api() });
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], [], game] });
    stepN(engine, 6); // build the block + let GameZoneSystem run one check
    const world = engine.getWorld()!;
    return { engine, world };
}

function playerTransform(world: any) {
    const eid = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return world.getComponent(eid, 'TransformComponent');
}

describe('game-mode entry is zone-gated on block.game', () => {
    it('block.game (raw[4]) round-trips through BlockSerializer', async () => {
        const { world } = await bootInBlock(1);
        const blockEid = world.getEntitiesWith(['BlockComponent'])[0];
        const block = world.getComponent<any>(blockEid, 'BlockComponent');
        expect(block.game).toBe(1); // ingested from raw[4]

        const raw = serializeBlockToRaw(world, blockEid)!;
        expect(raw[4]).toBe(1); // and persists back out
    });

    it('refuses Game-mode entry outside a game zone, permits it inside', async () => {
        // A non-game block: the player stands on it but it is not playable.
        const { engine, world } = await bootInBlock(0);
        expect(world.gameZoneActive).toBe(false);
        expect(engine.setMode(SystemMode.Game)).toBe(false); // refused
        expect(world.mode).toBe(SystemMode.Normal);

        // force bypasses the gate (engine-internal / tests only).
        expect(engine.setMode(SystemMode.Game, { force: true })).toBe(true);
        expect(world.mode).toBe(SystemMode.Game);
    });

    it('enters a game zone, allows Game entry, then auto-reverts on leaving', async () => {
        const enters: any[] = [], exits: any[] = [];
        const { engine, world } = await bootInBlock(1);
        engine.on('game.zone_enter', (p: any) => enters.push(p));
        engine.on('game.zone_exit', (p: any) => exits.push(p));

        // Standing in the playable block → zone active (entered during boot steps).
        expect(world.gameZoneActive).toBe(true);

        // Explicit entry through the gate succeeds (no force).
        expect(engine.setMode(SystemMode.Game)).toBe(true);
        expect(world.mode).toBe(SystemMode.Game);

        // Walk far out of the block → zone exits AND Game mode auto-reverts.
        const trans = playerTransform(world);
        const homeX = trans.position[0];
        trans.position[0] += 100; // ~6 blocks east, into un-injected (non-game) space
        stepN(engine, 2);
        expect(world.gameZoneActive).toBe(false);
        expect(world.mode).toBe(SystemMode.Normal); // contract: leaving stops play
        expect(exits.length).toBe(1);
        expect(exits[0].key).toBe('2048_2048');

        // Walk back in → zone re-enters (event carries the block.game value).
        trans.position[0] = homeX;
        stepN(engine, 2);
        expect(world.gameZoneActive).toBe(true);
        expect(enters.length).toBe(1);
        expect(enters[0].game).toBe(1);
    });

    it('actuator player.enterGame/exitGame funnel through the same gate', async () => {
        const { world } = await bootInBlock(1);
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const ctx = { world, playerId: player, mode: world.mode };

        world.actuator.execute({ type: 'player', target: '', method: 'enterGame', params: [] } as any, ctx);
        expect(world.mode).toBe(SystemMode.Game); // in-zone trigger → entry granted

        world.actuator.execute({ type: 'player', target: '', method: 'exitGame', params: [] } as any, { ...ctx, mode: world.mode });
        expect(world.mode).toBe(SystemMode.Normal);
    });

    it('actuator player.enterGame is refused when not in a zone', async () => {
        const { world } = await bootInBlock(0);
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        world.actuator.execute(
            { type: 'player', target: '', method: 'enterGame', params: [] } as any,
            { world, playerId: player, mode: world.mode });
        expect(world.mode).toBe(SystemMode.Normal); // gate held
    });
});

// The corrected game-mode (docs/systems/game-mode-entry.md §2): the game trigger's
// enterGame action carries a per-game exitPolicy, and the session is anchored to a
// block (world.activeGameBlock) rather than the player's live position — so a
// 'confirm' game survives the player stepping off (dialog up) while 'ephemeral'
// auto-exits. NOT a second SystemMode: gameplay gating is unchanged.
describe('exitPolicy + session anchoring (corrected game-mode)', () => {
    function enterGame(world: any, exitPolicy?: string) {
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const params = exitPolicy === undefined ? [] : [{ exitPolicy }];
        world.actuator.execute({ type: 'player', target: '', method: 'enterGame', params } as any,
            { world, playerId: player, mode: world.mode });
    }

    it('enterGame carries the exitPolicy + anchors the session block; exit clears both', async () => {
        const { world } = await bootInBlock(1);
        expect(world.activeGameBlock).toBeNull();
        expect(world.gameExitPolicy).toBe('ephemeral'); // default

        enterGame(world, 'confirm');
        expect(world.mode).toBe(SystemMode.Game);
        expect(world.gameExitPolicy).toBe('confirm');                 // from the trigger param
        expect(world.activeGameBlock).toEqual([2048, 2048]);          // anchored to the player's block

        world.actuator.execute({ type: 'player', target: '', method: 'exitGame', params: [] } as any,
            { world, playerId: 0, mode: world.mode });
        expect(world.mode).toBe(SystemMode.Normal);
        expect(world.activeGameBlock).toBeNull();                     // anchor cleared
        expect(world.gameExitPolicy).toBe('ephemeral');               // policy reset
    });

    it("a bare enterGame (no param) defaults to 'ephemeral'; an unknown value is coerced", async () => {
        const { world } = await bootInBlock(1);
        enterGame(world);                       // no params
        expect(world.gameExitPolicy).toBe('ephemeral');
        world.actuator.execute({ type: 'player', target: '', method: 'exitGame', params: [] } as any,
            { world, playerId: 0, mode: world.mode });

        enterGame(world, 'bogus');              // not a real policy → coerced to ephemeral
        expect(world.gameExitPolicy).toBe('ephemeral');
    });

    it("'ephemeral': stepping off the block silently auto-exits to Normal", async () => {
        const leaveIntents: any[] = [];
        const { engine, world } = await bootInBlock(1);
        engine.on('game.leave_intent', (p: any) => leaveIntents.push(p));
        enterGame(world, 'ephemeral');
        expect(world.mode).toBe(SystemMode.Game);

        const trans = playerTransform(world);
        trans.position[0] += 100; // ~6 blocks east, out of the zone
        stepN(engine, 2);

        expect(world.mode).toBe(SystemMode.Normal);   // silent auto-exit
        expect(world.activeGameBlock).toBeNull();
        expect(leaveIntents.length).toBe(0);          // no dialog for ephemeral
    });

    it("'confirm': stepping off KEEPS the round alive + emits game.leave_intent (no auto-exit)", async () => {
        const leaveIntents: any[] = [];
        const { engine, world } = await bootInBlock(1);
        engine.on('game.leave_intent', (p: any) => leaveIntents.push(p));
        enterGame(world, 'confirm');
        expect(world.mode).toBe(SystemMode.Game);

        const trans = playerTransform(world);
        const homeX = trans.position[0];
        trans.position[0] += 100; // step off the block
        stepN(engine, 2);

        // The round survives: mode stays Game, the session anchor is untouched, and
        // the interpreter is asked to confirm (vs the silent ephemeral exit).
        expect(world.mode).toBe(SystemMode.Game);
        expect(world.activeGameBlock).toEqual([2048, 2048]);
        expect(world.gameZoneActive).toBe(false);
        expect(leaveIntents.length).toBe(1);
        expect(leaveIntents[0].key).toBe('2048_2048');

        // Walk back in → resume the same round (still Game, still anchored).
        trans.position[0] = homeX;
        stepN(engine, 2);
        expect(world.gameZoneActive).toBe(true);
        expect(world.mode).toBe(SystemMode.Game);

        // Confirming the leave (exitGame) tears it down for real.
        world.actuator.execute({ type: 'player', target: '', method: 'exitGame', params: [] } as any,
            { world, playerId: 0, mode: world.mode });
        expect(world.mode).toBe(SystemMode.Normal);
        expect(world.activeGameBlock).toBeNull();
    });
});
