/**
 * shootingScene — constants only. The range FURNITURE + the b8 game trigger
 * (rich data declaration incl. the shooting config) are FROZEN DATA at
 * src/blocks/shooting.block.json (full-data-migration.md P2). Content must NOT
 * be re-authored in TS here — edit the block JSON (see scenes/README.md).
 */

/** Block carrying the NATIVE shooting range — one block south of spawn. */
export const SHOOTING_BLOCK: [number, number] = [2048, 2047];
