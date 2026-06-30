import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * mahjong3dScene — the NATIVE in-world mahjong table (Plan B), the discrete
 * counterpart to the native 3D pool. Like the external-app mahjong block
 * (mahjongScene.ts) it is a game zone, but via the plain playable marker
 * raw[4]=1 (NOT a registered Game-Setting id), so no external HUD starts — the
 * MahjongSystem owns everything natively and is ZONE-GATED (#3): it deals the
 * 136 tiles / hands / discards ON ENTERING Game and tears them down on leaving
 * (walking off the block auto-exits). The scene here is just the furniture — a
 * felt + legs + four stools.
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

    // GAME TRIGGER (b8): sitting down at the table ENTERS Game (trigger-borne entry,
    // docs/systems/game-mode-entry.md §1). exitPolicy 'confirm' — a turn-based round
    // you invest minutes in, so stepping off the block does NOT silently nuke it: the
    // engine emits game.leave_intent and the client asks "leave game?" (vs the arcade
    // 'ephemeral' of the range). Volume covers the table; gameOnly=0 so it fires in
    // Normal. row = [size, centre, rot, shape(1=box), gameOnly, [{type, oneTime?, actions}]].
    const enterTable = { type: 'player', method: 'enterGame', params: [{ exitPolicy: 'confirm' }] };
    data.raw[2].push([AdjunctType.Trigger, [
        [[5, 5, 3], [C[0], C[1], 1.5], [0, 0, 0], 1, 0, [{ type: 'in', oneTime: false, actions: [enterTable] }]],
    ]]);
    // raw[4] = coarse "this block is playable" bit (the zone gate scoping where
    // enterGame may succeed). Rich declaration (which game + exitPolicy) is on the
    // trigger above. NOT an external-app id, so GameRuntime starts no external HUD.
    data.raw[4] = 1;
    return data.raw;
}
