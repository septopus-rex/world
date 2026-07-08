/**
 * tumbleScene — constants only. Tower base + game trigger (tumble config in
 * data) are FROZEN at src/blocks/tumble.block.json (full-data-migration.md P2).
 * Content must NOT be re-authored in TS here (see scenes/README.md).
 */

/** Block carrying the native tumble tower — NE of spawn. */
export const TUMBLE_BLOCK: [number, number] = [2049, 2049];
/** Tower centre (block-local SPP). TumbleSystem builds the stack here, standing on
 *  the block ground; the player walks up and clicks pieces to pull them. */
export const TUMBLE_ORIGIN: [number, number] = [8, 8];
