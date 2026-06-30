import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * mahjong3dScene — the NATIVE in-world mahjong table (Plan B), the discrete
 * counterpart to the native 3D pool. Unlike the external-app mahjong block
 * (mahjongScene.ts, raw[4] = a Game Setting id), this is NOT a game zone: the
 * tiles are physically "在场" and driven by the engine's MahjongSystem, no
 * mode-gating. The scene here is just the furniture — a felt + legs + four
 * stools; the MahjongSystem spawns the 136 tiles, hands, and discards on top.
 *
 * Sits one block WEST of the demo spawn (external mahjong is east, pool is north),
 * so the three demos are neighbours the player can walk between.
 */

/** Block carrying the NATIVE mahjong table — one block west of spawn. */
export const NATIVE_MAHJONG_BLOCK: [number, number] = [2047, 2048];

/** Felt top altitude — the MahjongSystem rests tiles on this surface. */
export const MAHJONG_SURFACE_Z = 0.95;

export function buildMahjong3DScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    // a2 box rows: [size, pos, rot, colorIdx, repeat, animate, stop]. SPP X=East
    // Y=North Z=Alt. A wide felt (room for 14-tile hands) + legs + four stools.
    const C = [8, 8];
    const felt = 4.6, feltZ = 0.8, feltTop = MAHJONG_SURFACE_Z; // top = 0.95
    const leg = 1.9;
    const boxes = [
        [[felt, felt, 0.3], [C[0], C[1], feltZ], [0, 0, 0], 2, [1, 1], 0, 1], // felt bed (blue palette)
        [[0.3, 0.3, feltZ], [C[0] - leg, C[1] - leg, feltZ / 2], [0, 0, 0], 1, [1, 1], 0, 1], // legs
        [[0.3, 0.3, feltZ], [C[0] + leg, C[1] - leg, feltZ / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.3, 0.3, feltZ], [C[0] - leg, C[1] + leg, feltZ / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.3, 0.3, feltZ], [C[0] + leg, C[1] + leg, feltZ / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        // four stools (one per seat)
        [[0.7, 0.7, 0.5], [C[0], C[1] - 3.0, 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // S (human)
        [[0.7, 0.7, 0.5], [C[0], C[1] + 3.0, 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // N
        [[0.7, 0.7, 0.5], [C[0] - 3.0, C[1], 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // W
        [[0.7, 0.7, 0.5], [C[0] + 3.0, C[1], 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // E
    ];
    data.raw[2].push([AdjunctType.Box, boxes]);
    // raw[4] = game flag: 1 = playable zone (NOT a registered external-app id like
    // 42/43, so GameRuntime starts no external HUD — just the zone gate). Entering
    // Game here deals the tiles (MahjongSystem); leaving auto-exits + tears them
    // down. See docs/systems/game-mode-entry.md.
    data.raw[4] = 1;
    return data.raw;
}
