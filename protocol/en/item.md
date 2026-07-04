# Septopus Item Protocol

Items are **pickable, carryable, derivable** world content. The core design: an
item instance stores only two numbers — `{templateId, seed}`. Rarity and every
attribute are derived by a **pure seeded function**: any client / any engine must
compute the SAME item from the same `(template, seed)`; nothing derivable is ever
persisted (or forgeable).

> **Normative**: this file pins every step of the derivation. Reference
> implementation: `engine/src/core/services/ItemRegistry.ts`; changing any
> formula there requires updating this spec. Design background:
> `docs/plan/specs/inventory-local-first.md`.

## 1. Data Model

**Item instance** (storage/wire shape):
```
{ templateId: number, seed: number (uint32), count?: number }
```

**Item template** (world CONTENT — registered by the host/world; the engine
ships no templates; the demo catalogue in
`engine/src/core/mocks/ItemTemplates.ts` is mock content):
```ts
ItemTemplate = {
  id: number,
  name: string,
  category: 0 Material · 1 Consumable · 2 Equipment · 3 Key · 4 Collectible,
  stackable: number,          // 0 = unique (identity includes seed, never stacks); >0 = stack limit per slot
  visual: { shape: 'box'|'sphere'|'cone', size: [x,y,z] (Septopus order, metres), color: 0xRRGGBB },
  attributes: AttributeRule[],  // rules; ARRAY ORDER IS THE DRAW ORDER (§3)
  rarityWeights: number[],      // probability weights Common..Legendary
}
AttributeRule = { name: string, baseRange: [lo, hi], rarityScale: number }
```

**Rarity**: `0 Common · 1 Uncommon · 2 Rare · 3 Epic · 4 Legendary`.

## 2. PRNG (Normative): mulberry32

Seed is `seed >>> 0` (uint32). Each call yields a float in `[0,1)`; all
arithmetic is on the **uint32 ring**:

```
state = seed >>> 0
next():
  state = (state + 0x6D2B79F5) >>> 0
  t = state
  t = imul(t XOR (t >>> 15), t OR 1)
  t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))
  return ((t XOR (t >>> 14)) >>> 0) / 4294967296
```

`imul` = 32-bit signed integer multiply (truncated to 32 bits). Any engine must
reproduce this sequence bit-for-bit.

## 3. Derivation Algorithm (Normative — the call ORDER is the protocol)

For `(template, seed)`, take a fresh PRNG and consume draws in EXACTLY this
order:

**Draw 1 · rarity**:
```
weights = rarityWeights if non-empty else [1]
total   = Σ max(0, w)
roll    = next() × (1 if total == 0 else total)
walk i from 0, subtracting max(0, weights[i]); the first i making roll < 0 is
the rarity; no hit → Common (0)
```

**Draws 2..N · attributes** (in `template.attributes` ARRAY ORDER, exactly one
`next()` per rule):
```
base  = lo + next() × (hi − lo)
value = floor(base × (1 + rarity × rarityScale))
```

> Order-sensitive: inserting/reordering rules shifts every later draw — once a
> template is published, its `attributes` order is immutable.

## 4. Identity & Stacking (Normative)

```
stackable > 0  →  identity = "tpl_{id}"           (one stack per template)
stackable = 0  →  identity = "itm_{id}_{seed>>>0}" (every instance unique)
```

## 5. Rarity Display Tint (Normative formula)

Brighten the base color toward white: `k = min(1, rarity × 0.18)`, per channel
`c' = min(255, round(c + (255−c) × k))`. (Pure integer math, portable; any
further tone-mapping in the render pipeline is renderer-defined.)

## 6. Where Items Land in the World

- **b5 adjunct** (pickable item) raw: `[pos, templateId, seed, count, rot]` —
  see the adjunct protocol.
- Pickup/drop is atomic (inventory change + block-raw reserialization complete
  in the same frame, `ItemSystem`).
- JSONLogic conditions can read `inventory.*` (e.g. a door checking key count).
