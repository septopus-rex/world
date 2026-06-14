/**
 * Parkour level — the first authored, goal-driven experience (PLAYABLE Path A).
 *
 * A floating course that spans THREE blocks northward, so it both has room for a
 * real jump gap AND exercises dynamic block streaming (blocks load ahead as you
 * run north, far ones evict). The strip floats at ~14 m over the per-block
 * auto-ground, so falling — off the side or into the gap — is lethal (> 12 m) →
 * respawn at the last checkpoint (player.setSpawn). Overshooting a jump just
 * lands further along the continuous course (not into the void), which is what
 * makes platforming workable in the small per-block space.
 *
 * `buildParkourBlock(bx, by)` returns the native block raw for any requested
 * block: the course segment for the three course blocks, else an empty block
 * (auto-ground) so the surrounding streamed neighborhood is valid.
 * SPP coords are block-local: X=East, Y=North, Z=Alt.
 */

/** The course runs up block column bx=2048, by=2048→2053 (6 blocks — longer
 *  than the 5-block stream window, so blocks load ahead / evict behind). */
const COURSE_BX = 2048;
const COURSE_BY0 = 2048;
const COURSE_BY2 = 2053;

export const PARKOUR_BLOCK: [number, number] = [COURSE_BX, COURSE_BY0];
export const PARKOUR_FINISH_BLOCK: [number, number] = [COURSE_BX, COURSE_BY2];

/** Base floating altitude — platform tops sit here; auto-ground is at 0. */
const Z = 14;

export const PARKOUR_START = {
    block: PARKOUR_BLOCK,
    position: [8, 3, Z + 1] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
};

/** The flag the finish trigger sets — the client watches it to stop the timer. */
export const PARKOUR_COMPLETE_FLAG = 'level_complete';

/** A blue platform centered at (e,n), `w` wide (E) × `d` deep (N), top at `top`. */
function platform(e: number, n: number, w: number, d: number, top = Z): any[] {
    return [[w, d, 0.5], [e, n, top - 0.25], [0, 0, 0], 2 /* blue */, [1, 1], 0, 0];
}

/** A trigger volume (b8). [size, offset, rot, shape, gameOnly, events]. */
function trigger(e: number, n: number, actions: any[], oneTime = false, span = 3): any[] {
    return [[span, span, 3], [e, n, Z + 1], [0, 0, 0], 1, 0, [{ type: 'in', oneTime, actions }]];
}

const SET_SPAWN = { type: 'player', method: 'setSpawn', params: [] };
const COMPLETE = { type: 'flag', method: '', target: PARKOUR_COMPLETE_FLAG, params: [true] };

const EMPTY_BLOCK: any[] = [0, 1, [], []];

/**
 * Course segment for a block, or an empty block for anything off-course.
 * Platforms overlap the block boundaries (N≈16 of one = N≈0 of the next) so the
 * strip is continuous across blocks.
 */
export function buildParkourBlock(bx: number = COURSE_BX, by: number = COURSE_BY0): any[] {
    if (bx !== COURSE_BX || by < COURSE_BY0 || by > COURSE_BY2) return EMPTY_BLOCK;
    const seg = by - COURSE_BY0;
    const lastSeg = COURSE_BY2 - COURSE_BY0;

    let boxes: any[] = [];
    let triggers: any[] = [];

    if (seg === 0) {
        // Start block: spawn, a gentle walk north, checkpoint, strip to the edge.
        boxes = [
            platform(8, 3, 4, 5),    // start  N0.5–5.5
            platform(8, 9, 3, 8),    // strip  N5–13
            platform(8, 15, 3, 5),   // strip  N12.5–17.5 (over the north boundary)
        ];
        triggers = [trigger(8, 9, [SET_SPAWN])]; // checkpoint
    } else if (seg === lastSeg) {
        // Finish block: short strip to the finish pad.
        boxes = [platform(8, 4, 3, 10)]; // strip N-1–9
        triggers = [trigger(8, 6, [COMPLETE], true, 4)]; // finish
    } else if (seg === 2) {
        // A JUMP GAP block: strip → gap (N6.5–9.5) → strip. Checkpoints either side.
        boxes = [
            platform(8, 3, 3, 8),    // strip  N-1–7
            platform(8, 13, 3, 8),   // strip  N9–17 (after the gap)
        ];
        triggers = [
            trigger(8, 2, [SET_SPAWN]),   // before the gap
            trigger(8, 13, [SET_SPAWN]),  // after the gap
        ];
    } else {
        // A plain continuous strip block + a mid checkpoint.
        boxes = [platform(8, 8, 3, 18)]; // strip N-1–17 (spans the whole block)
        triggers = [trigger(8, 8, [SET_SPAWN])];
    }
    return [0, 1, [[0x00a2, boxes], [0x00b8, triggers]], []];
}
