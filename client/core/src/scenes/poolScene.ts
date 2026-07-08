/**
 * poolScene — constants only. Table furniture + game trigger (pool config in
 * data) are FROZEN at src/blocks/pool.block.json (raw[4]=43 external app id).
 * Content must NOT be re-authored in TS here (see scenes/README.md).
 */

/** Pool table block — north of the demo spawn (mahjong is east). raw[4] = POOL_GAME_ID. */
export const POOL_BLOCK: [number, number] = [2048, 2049];
