import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * shootingScene — the NATIVE in-world shooting range (Plan B), the SHOT-and-REACT
 * counterpart to the native pool (continuous physics) and mahjong (discrete turn
 * based). A ZONE-GATED game (raw[4]=1, #3): the scene is just the furniture — a
 * firing-line counter + a backstop wall — while the ShootingRangeSystem spawns
 * the sphere targets ON ENTERING Game and tears them down on leaving (walking
 * off the block auto-exits). It recolours targets on hit (runtime recolour, #1).
 *
 * Sits one block SOUTH of the demo spawn (mahjong is west, pool north, external
 * mahjong east), so all four demos are neighbours the player can walk between.
 */

/** Block carrying the NATIVE shooting range — one block south of spawn. */
export const SHOOTING_BLOCK: [number, number] = [2048, 2047];

/** Range centre (block-local SPP). Targets float a couple of metres NORTH of this,
 *  at ~eye height, in front of the backstop — the ShootingRangeSystem places them
 *  (origin + dist). The player walks up from the south firing line and faces north. */
export const SHOOTING_ORIGIN: [number, number] = [8, 8];
export const SHOOTING_TARGET_DIST = 2.5; // north offset of the target row from origin
export const SHOOTING_TARGET_Z = 1.6;    // target centre altitude (~eye height)

export function buildShootingScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    // a2 box rows: [size, pos, rot, colorIdx, repeat, animate, stop]. SPP X=East
    // Y=North Z=Alt. A backstop wall behind the targets + a low firing-line counter.
    const C = SHOOTING_ORIGIN;
    const targetN = C[1] + SHOOTING_TARGET_DIST;
    const boxes = [
        // backstop wall (dark) behind the targets — clean backdrop, reads the hit.
        [[8, 0.4, 3], [C[0], targetN + 1.0, 1.5], [0, 0, 0], 1, [1, 1], 0, 1],
        // firing-line counter the player walks up to (south of the targets).
        [[6, 0.6, 1.0], [C[0], C[1] - 2.5, 0.5], [0, 0, 0], 1, [1, 1], 0, 1],
    ];
    data.raw[2].push([AdjunctType.Box, boxes]);

    // GAME TRIGGER (b8): walking up to the firing line ENTERS Game (the trigger-borne
    // entry, docs/systems/game-mode-entry.md §1). `enterGame` carries the per-game
    // exitPolicy — 'ephemeral' here: an arcade range, walk off the block and the round
    // silently ends. Volume sits just north of the spawn-in spot so you enter by
    // stepping toward the targets (gameOnly=0 so it fires in Normal). row format =
    // [size, centre, rot, shape(1=box), gameOnly, [{type, oneTime?, actions}]].
    const enterRange = { type: 'player', method: 'enterGame', params: [{ exitPolicy: 'ephemeral' }] };
    data.raw[2].push([AdjunctType.Trigger, [
        [[5, 3, 3], [C[0], C[1] + 1.5, 1.5], [0, 0, 0], 1, 0, [{ type: 'in', oneTime: false, actions: [enterRange] }]],
    ]]);
    // raw[4] = coarse "this block is playable" bit (the zone gate that scopes where
    // enterGame may succeed). NOT a registered external-app id like 42/43, so
    // GameRuntime starts no external HUD. Rich declaration is on the trigger above.
    data.raw[4] = 1;
    return data.raw;
}
