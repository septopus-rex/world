# Septopus Determinism & Conformance

> **Normative.** The "cross-engine, pure-data 3D world" only holds if **the
> same data resolves into the same world in every engine**. This document
> pins every deterministic derivation (the pins) and provides the conformance
> acceptance checklist. The protocol forbids wall-clock time, `Math.random`,
> and platform-sensitive float paths inside these derivations.

## 1. The base PRNG: mulberry32

Every seed-driven derivation uses mulberry32. **The reference implementation
IS the specification** (bit-for-bit):

```js
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
```

- Seeds are normalized to uint32 with `>>> 0` first.
- **Draw counts are normative**: where a pin says "exactly N rng draws",
  implementations must not draw more or fewer (the remaining sequence would
  shift wholesale).

## 2. The pins

| # | Derivation | Input → output | Spec |
|---|---|---|---|
| P1 | **Item instance** | `(templateId, seed)` → rarity + attributes (draw order pinned bit-for-bit) | [item.md](item.md) (normative) |
| P2 | **World time/weather** | `(chain height, chain hash, interval, epoch)` → calendar + weather (hash slicing) | [world.md](world.md) §3.1 |
| P3 | **NPC wander target** | home anchor + `seed` → target sequence: **exactly 2 rng draws per target**, `r = R·√(rng())`, `θ = rng()·2π`, uniform over the disk around home | [adjunct-types.md](adjunct-types.md) §9.1 |
| P4 | **Motif expansion** | `(template, seed, params)` → adjunct row group, byte-identical (the iNFT property) | [adjunct-types.md](adjunct-types.md) §11 |
| P5 | **SPP particle expansion** | `(cells, theme)` → standard adjunct entity group (pure function, no randomness) | the SPP specification |
| P6 | **AI generation-doc compile** | GenerationDoc → block raw: groups sorted by ascending typeId; a generator piece's default seed = `doc.seed + pieceIndex` | `GenerationDoc.ts` (single shared source) |
| P7 | **Game session replay** | `(seed, action sequence)` → the same game state/outcome (state is never persisted; replay is the verification) | [game.md](game.md) §9 |
| P8 | **Simulation stepping** | under fixed-step `step(dt)` with the same input sequence → the same world state (timers run on simulation time; wall clock forbidden) | engine contract |

## 3. Conformance checklist

An engine claiming to implement the Septopus protocol should pass, against the
reference implementation:

1. **Decode parity**: the same block raw (samples covering all 18 types) →
   the same entity set (types/positions/sizes/attributes); missing trailing
   slots never fail and take the tabled defaults.
2. **PRNG parity**: the first 8 outputs of `mulberry32(42)` match the
   reference bit-for-bit.
3. **Item parity**: sample derivations such as `(template=1, seed=777)` yield
   the reference rarity/attributes (P1).
4. **Expansion parity**: the same `(template, seed, params)` motif expansion is
   byte-identical (P4); the same cells' SPP expansion yields the same entity
   group (P5).
5. **Time/weather parity**: the same `(height, hash)` derives the same
   calendar and weather (P2).
6. **Walking semantics**: AABB collision + step-over (≤ 0.5 m) + the three b4
   shapes (including continuous slope walking) produce comparable paths in the
   sample scenes (perceptual equivalence; per-frame bit equality is NOT
   required — see §4).
7. **Rotation appearance**: the rotation-contract samples (90°/45° about each
   axis) render with the same orientation as the reference (see
   [world.md](world.md) §Coordinate & Rotation Contract).

## 4. Explicitly NOT bit-pinned

- **Rendered pixels**, lighting, shadows — perceptual equivalence suffices.
- **Per-frame float values of player-motion integration** — physics stepping
  may differ across platforms; the protocol requires the semantics (a walkable
  slope must be walkable, a blocking wall must block). P7 session replay runs
  **within one implementation**.
- Network/resource loading timing (loading is async; converged world state
  must agree).

---

*Protocol v0.1 (engine v0.1.0).*
