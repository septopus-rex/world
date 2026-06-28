/**
 * Deterministic seeded PRNG for generative adjuncts (motif, c2).
 *
 * The engine's expansion contract is "same input → identical output"
 * (see core/spp/Expander.ts). Generative content needs variety, but that
 * variety must come from an explicit SEED — never Math.random / wall clock —
 * so a (template, seed) pair reproduces the same content anywhere and stays
 * snapshot-testable. mulberry32 is a tiny, well-distributed 32-bit generator.
 */
export type Rng = () => number;

/** mulberry32 — seed in, deterministic stream of floats in [0, 1). */
export function makeRng(seed: number): Rng {
    let a = (seed >>> 0) || 1; // a seed of 0 locks the generator → force 1
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
    return min + (max - min) * rng();
}

/** Integer in [min, max] inclusive. */
export function int(rng: Rng, min: number, max: number): number {
    return Math.floor(range(rng, min, max + 1));
}

/** Pick one element deterministically. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length) % arr.length];
}
