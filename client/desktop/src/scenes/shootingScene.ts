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
    // raw[4] = game flag: 1 = playable zone (NOT a registered external-app id like
    // 42/43, so GameRuntime starts no external HUD — just the zone gate). Entering
    // Game here spawns the targets (ShootingRangeSystem); leaving auto-exits + tears
    // them down. See docs/systems/game-mode-entry.md.
    data.raw[4] = 1;
    return data.raw;
}
