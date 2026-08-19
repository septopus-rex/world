/**
 * Mahjong rule core — the single source of truth for tile shape, win detection,
 * shanten, claim legality, scoring and bot policy.
 *
 * Engine-independent by construction: every file here is pure functions over
 * numbers, with no imports outside this folder. Hosts:
 *   · `core/systems/MahjongSystem.ts` — the in-world 3D table (Pattern B)
 *   · `client/core/src/games/mahjong/*` — the external app (Pattern A), which
 *     also runs headless on `services/mahjong`
 */

export * from './Tiles';
export * from './Rules';
export * from './Score';
export * from './Bot';
