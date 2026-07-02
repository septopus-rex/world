/**
 * AdjunctType — the single source of truth for built-in adjunct type-ids.
 *
 * These match the Septopus on-chain adjunct set; the engine dispatches blocks on
 * them (AdjunctRegistry), authors raw with them (scenes / levels / mocks), and
 * branches on them in a few systems (SPP expansion, collision, serialization).
 * Before this enum those ids were raw `0x00xx` hex scattered across ~30 files,
 * where `0x00b8` vs `0x00b6` was a silent-bug typo waiting to happen and "what is
 * 0x00b6?" needed a comment to answer. Name them once, reference them everywhere.
 *
 * A `const` object (not a TS `enum`) so the values stay plain numbers usable as
 * Map keys / array entries / comparisons with zero runtime wrapper. Tests
 * deliberately keep the literal hex as an independent golden reference for these
 * mappings — do not migrate the test assertions to this enum.
 */
export const AdjunctType = {
    Wall: 0x00a1,
    Box: 0x00a2,
    Light: 0x00a3,
    Module: 0x00a4,   // external 3D model
    Water: 0x00a5,
    Cone: 0x00a6,
    Ball: 0x00a7,     // rendered as a sphere
    Stop: 0x00b4,     // invisible collider
    Item: 0x00b5,     // pickable
    Particle: 0x00b6, // string-particle (SPP); expands to standard adjuncts
    Trigger: 0x00b8,
    Spawner: 0x00b9,  // timed runtime generator (template + interval + maxAlive; F1)
    Track: 0x00c1,    // tube rail (coaster)
    Motif: 0x00c2,    // generative content (seed + template → standard adjuncts)
    Link: 0x00e1,     // clickable URL / QR panel
    Audio: 0x00e2,    // spatial audio emitter (source → PositionalAudio)
    Video: 0x00e3,    // video screen (source → VideoTexture on a plane)
} as const;

export type AdjunctTypeId = (typeof AdjunctType)[keyof typeof AdjunctType];

/** Reverse map (id → name) for logging / debugging. */
export const AdjunctTypeName: Readonly<Record<number, string>> = Object.freeze(
    Object.fromEntries(Object.entries(AdjunctType).map(([name, id]) => [id, name])),
);

/** Human-readable name for a type-id, or `0x..` hex if it is not a built-in. */
export function adjunctTypeName(typeId: number): string {
    return AdjunctTypeName[typeId] ?? `0x${typeId.toString(16)}`;
}
