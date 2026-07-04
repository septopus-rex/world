import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { MAHJONG_GAME_ID } from '../games/mahjong/setting';

/**
 * mahjongScene — the in-world mahjong table block. The entire "rich 3D app"
 * footprint in world data is this: a table + stools, and the block flagged as a
 * game zone (raw[4] = the Game Setting resource id). The game itself is the
 * external mahjong app, reached only through the Game Setting (game.md). Walking
 * onto this block → "Enter Game" → the engine resolves MAHJONG_SETTING + start.
 */

/** Block that carries the mahjong table — one block east of the demo spawn so the
 *  player can walk straight to it. Its raw[4] = MAHJONG_GAME_ID makes it a game zone. */
export const MAHJONG_BLOCK: [number, number] = [2049, 2048];

export function buildMahjongScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    // a2 box rows: [size, pos, rot, colorIdx, repeat, animate, stop]. Septopus coords
    // X=East Y=North Z=Alt. Table centred at E8/N8; stop=1 makes pieces solid.
    const C = [8, 8]; // block-centre
    const table = [
        [[3, 3, 0.35], [C[0], C[1], 0.95], [0, 0, 0], 2, [1, 1], 0, 1], // felt top (blue palette)
        [[0.3, 0.3, 0.9], [C[0] - 1.3, C[1] - 1.3, 0.45], [0, 0, 0], 1, [1, 1], 0, 1], // legs
        [[0.3, 0.3, 0.9], [C[0] + 1.3, C[1] - 1.3, 0.45], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.3, 0.3, 0.9], [C[0] - 1.3, C[1] + 1.3, 0.45], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.3, 0.3, 0.9], [C[0] + 1.3, C[1] + 1.3, 0.45], [0, 0, 0], 1, [1, 1], 0, 1],
    ];
    const stools = [
        [[0.7, 0.7, 0.5], [C[0], C[1] - 2.4, 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // S
        [[0.7, 0.7, 0.5], [C[0], C[1] + 2.4, 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // N
        [[0.7, 0.7, 0.5], [C[0] - 2.4, C[1], 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // W
        [[0.7, 0.7, 0.5], [C[0] + 2.4, C[1], 0.25], [0, 0, 0], 3, [1, 1], 0, 1], // E
    ];
    data.raw[2].push([AdjunctType.Box, [...table, ...stools]]);
    data.raw[4] = MAHJONG_GAME_ID; // block-level game flag = the Game Setting resource id
    return data.raw;
}
