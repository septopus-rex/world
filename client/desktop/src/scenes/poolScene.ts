import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { POOL_GAME_ID } from '../games/pool/setting';

/**
 * poolScene — the in-world pool table block (the SECOND game, proving the world
 * hosts many external apps uniformly). Like the mahjong table it's box primitives
 * + a game-zone flag; the game itself is the external pool app reached through the
 * Game Setting. Sits one block NORTH of spawn (mahjong is one block east).
 */

/** Pool table block — north of the demo spawn (mahjong is east). raw[4] = POOL_GAME_ID. */
export const POOL_BLOCK: [number, number] = [2048, 2049];

export function buildPoolScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    // a2 box rows: [size, pos, rot, colorIdx, repeat, animate, stop]. SPP X=East
    // Y=North Z=Alt. A long felt bed + raised rails; stop=1 makes pieces solid.
    const C = [8, 8];
    const bedW = 7, bedD = 4; // table footprint (E × N)
    const rail = 0.4, railH = 0.55, bedTop = 0.8;
    const boxes = [
        [[bedW, bedD, 0.3], [C[0], C[1], bedTop], [0, 0, 0], 2, [1, 1], 0, 1], // green-ish felt bed (blue palette)
        // four rails around the bed
        [[bedW + rail * 2, rail, railH], [C[0], C[1] - bedD / 2, bedTop + 0.15], [0, 0, 0], 1, [1, 1], 0, 1], // S rail
        [[bedW + rail * 2, rail, railH], [C[0], C[1] + bedD / 2, bedTop + 0.15], [0, 0, 0], 1, [1, 1], 0, 1], // N rail
        [[rail, bedD, railH], [C[0] - bedW / 2, C[1], bedTop + 0.15], [0, 0, 0], 1, [1, 1], 0, 1],            // W rail
        [[rail, bedD, railH], [C[0] + bedW / 2, C[1], bedTop + 0.15], [0, 0, 0], 1, [1, 1], 0, 1],            // E rail
        // four legs
        [[0.4, 0.4, bedTop], [C[0] - bedW / 2 + 0.5, C[1] - bedD / 2 + 0.5, bedTop / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.4, 0.4, bedTop], [C[0] + bedW / 2 - 0.5, C[1] - bedD / 2 + 0.5, bedTop / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.4, 0.4, bedTop], [C[0] - bedW / 2 + 0.5, C[1] + bedD / 2 - 0.5, bedTop / 2], [0, 0, 0], 1, [1, 1], 0, 1],
        [[0.4, 0.4, bedTop], [C[0] + bedW / 2 - 0.5, C[1] + bedD / 2 - 0.5, bedTop / 2], [0, 0, 0], 1, [1, 1], 0, 1],
    ];
    data.raw[2].push([0x00a2, boxes]);
    data.raw[4] = POOL_GAME_ID; // block-level game flag = the Game Setting resource id
    return data.raw;
}
