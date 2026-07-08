/**
 * mahjong3dScene — constants only. Table furniture + trigger are FROZEN at
 * src/blocks/mahjong3d.block.json. The tile DEAL stays a host call
 * (setupMahjong3D: face images are client-generated CAS resources — pending
 * the resource-manifest data pass). Content must NOT be re-authored in TS
 * here (see scenes/README.md).
 */

/** Block carrying the NATIVE 3D mahjong table — one block west of spawn. */
export const NATIVE_MAHJONG_BLOCK: [number, number] = [2047, 2048];
/** Table-top altitude the dealt tiles sit on (block-local Septopus Z). */
export const MAHJONG_SURFACE_Z = 0.95;
