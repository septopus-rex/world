/**
 * Coaster level — a roller coaster COLLAPSED FROM SPP (PLAYABLE Path A, ride).
 *
 * A single-block b6 'coaster' source: a U-shaped rail of cells (north → turn
 * east → turn south) floating at ~14 m. BlockSystem collapses it into c1 tube
 * track pieces (the visible rail); CoasterSystem builds the ride path from the
 * same cells and, in GAME mode, carries the player along it to the finish
 * (globalFlags.coaster_complete).
 *
 * SPP coords are block-local: X=East, Y=North, Z=Alt. faces order
 * [Top, Bottom, Front(S), Back(N), Left(W), Right(E)]; Open=0 Closed=1.
 */

export const COASTER_BLOCK: [number, number] = [2048, 2048];
const Z = 14;

export const COASTER_START = {
    block: COASTER_BLOCK,
    position: [4, 4, Z + 2] as [number, number, number], // ≈ first cell centre
    rotation: [0, 0, 0] as [number, number, number],
};

export const COASTER_COMPLETE_FLAG = 'coaster_complete';

const O: [number, number] = [0, 0]; // open  (rail passes through)
const C: [number, number] = [1, 0]; // closed
const FB: Array<[number, number]> = [C, C, O, O, C, C]; // Front+Back  → straight N/S
const LR: Array<[number, number]> = [C, C, C, C, O, O]; // Left+Right  → straight E/W
const FR: Array<[number, number]> = [C, C, O, C, C, O]; // Front+Right → turn S↔E
const LF: Array<[number, number]> = [C, C, O, C, O, C]; // Front+Left  → turn S↔W

const cell = (position: [number, number, number], faces: Array<[number, number]>) => ({ position, level: 0, faces });

/** U-shaped rail: up the west side, across the top, down the east side. */
export function buildCoasterBlock(): any[] {
    const origin: [number, number, number] = [2, 2, Z];
    const cells = [
        cell([0, 0, 0], FB),   // start  (N)
        cell([0, 1, 0], FB),
        cell([0, 2, 0], FR),   // turn east
        cell([1, 2, 0], LR),   // across
        cell([2, 2, 0], LF),   // turn south
        cell([2, 1, 0], FB),   // down the east side
        cell([2, 0, 0], FB),   // end
    ];
    // raw[4] = 1: this block is a PLAYABLE game zone. Standing here lets the
    // player enter Game mode (GameZoneSystem → confirm) to ride the coaster;
    // leaving the block drops back to Normal. See docs/systems/game-mode-entry.md.
    return [0, 1, [[0x00b6, [[origin, cells, 'coaster']]]], [], 1];
}
