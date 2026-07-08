/**
 * mahjongScene — constants only. Table furniture is FROZEN at
 * src/blocks/mahjong.block.json (raw[4]=42 external app id). Content must NOT
 * be re-authored in TS here (see scenes/README.md).
 */

/** Block that carries the mahjong table — one block east of the demo spawn so the
 *  player can walk straight to it. Its raw[4] = MAHJONG_GAME_ID makes it a game zone. */
export const MAHJONG_BLOCK: [number, number] = [2049, 2048];
