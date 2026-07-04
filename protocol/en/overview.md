# Septopus World Overview

> **Start here.** This page explains, in one read, **what** a Septopus world is
> made of, **how** the parts compose, and **why** it is designed this way. Then
> dive into the per-topic specs. Normative details live in [world](world.md) /
> [block](block.md) / [adjunct-types](adjunct-types.md) / [trigger](trigger.md) /
> [determinism](determinism.md); implementation details in [`docs/`](../../docs/).

## 1. In one sentence

Septopus is a **cross-engine, pure-data 3D world protocol**: everything in the
world — terrain, objects, interactions, gameplay, time, weather — is **plain
data with deterministic semantics**. An engine does exactly one thing: resolve
that data into a walkable, playable 3D world. **Same data, same world, in any
compliant engine.**

## 2. Spatial composition: world ← block ← adjunct

Three nested spatial containers, large to small:

```
Universe (6 faces × 4×4 = 96 worlds)
  └─ World      a bounded 4096 × 4096 grid of blocks; owned by a "Lord"
       └─ Block   a 16m × 16m atomic space container; ownable, tradable (digital real estate)
            └─ Adjunct   everything placed on a block (walls / items / NPCs / triggers / lights…)
```

- **World**: the top-level bounding box that enforces global physics and
  atmosphere; each world has a Lord (holding an NFT/key) who tunes terrain base
  colour, default elevation, allowed modes, etc. See [world.md](world.md).
- **Block**: the world's **basic unit and the actual asset** — 16×16 m, single
  owner, tradable, abandonable-and-reclaimable. It is the spatial anchor:
  adjunct coordinates are relative to the block origin (south-west corner), and
  moving a block moves everything on it. A block's content is a **5-tuple**
  `[elevation, status, adjuncts, animations, game-flag]`. See [block.md](block.md).
- **Adjunct**: the content atom on a block — 18 built-in types (geometry / light
  / model / water / item / NPC / trigger / spawner / media…), each a compact
  `[typeId, data slots…]` raw row. Adjuncts are fully decoupled from the engine:
  loadable from local, IPFS, or chain. See [adjunct-types.md](adjunct-types.md).

**Why the "block" granularity?** The 16-metre tile is simultaneously the **unit
of ownership** (individually owned / traded / published), the **unit of
streaming** (an engine loads only the blocks around the player, so a 4096×4096
world never overflows memory), and the **unit of content addressing** (one block
= one diffable, chainable, shareable piece of data). Ownership, performance and
storage share a single boundary — that is the bedrock of the whole architecture.

## 3. Content composition: everything is a data vocabulary

The core creed is **"data is logic"** — authors never write code, they fill in
data:

| You want | The data you write |
|---|---|
| A wall / a light / a model | one adjunct raw row (type + size/pos/resource) |
| "step here → open the door" / "teleport only with a key" | a trigger (event + JSONLogic condition + action), see [trigger.md](trigger.md) |
| A monster that walks and fights | an NPC behavior document (a data state machine) |
| A dialogue / a quest | a dialogue tree + a flags recipe (zero new primitives) |
| A village / a tower | generative content (template + seed, deterministic expansion) |

The payoff is **cross-engine portability**: the data contains no engine-specific
code or geometry, so swapping the renderer (UE / Babylon / custom) only rewrites
the "interpreter" — existing world content is untouched. The reference
implementation (this repo's TS engine) confines rendering to a single layer
precisely to hold that line.

## 4. Environmental composition: time and weather are **derived**, not stored

The world does not store "what time is it, what's the weather" — it **derives
them as pure functions** of deterministic sources:

```
chain height + chain hash + block interval  ──pure fn──▶  year/month/day/hour + current weather
```

- **Time**: the world clock is computed from chain height (a chain calendar);
  day/night and dawn/dusk derive from it, and the engine glides smoothly across
  calendar jumps rather than snapping.
- **Weather**: derived deterministically from slices of the chain hash
  (clear/rain/thunderstorm + grade); same height + hash → same weather.

**Why not just store it?** Because the goal is **cross-engine agreement without
trust**: any engine, at any moment, given the same (height, hash) computes the
same world-time and weather — no central server needs to "broadcast the current
weather". This is the same philosophy as deterministic item instances and
generative content from a seed. Normative in [world.md §3.1](world.md) and
[determinism.md](determinism.md).

## 5. Gameplay composition: five modes + a data-driven interaction loop

- **Modes**: Normal (free walking) / Edit (placement) / Game (zone-gated
  gameplay) / Ghost (noclip flight) / Observe (orbit). Game is not a free toggle
  — it is gated by a block's playable flag, and entry is ceremonial (walk to a
  trigger → confirm).
- **The interaction loop**: a player click/collision → a trigger/NPC evaluates
  conditions → runs **actions** (the actuator: damage, give item, teleport,
  spawn, play sound…) → mutates world state (flags/inventory/health) → which
  becomes the input to the next condition. The whole loop is data + generic
  systems, with zero bespoke gameplay code — a full RPG is built this way out of
  pure-data levels.

## 6. Storage composition: local-first, chain-optional

- **Local-first**: edits save as local drafts (IndexedDB); publishing enters
  content-addressed storage (CID). You can author and play with zero wallet and
  zero network.
- **Chain-optional**: the chain exists as an **optional publishing plugin**
  (injected via `IChainPublisher`); without it the engine runs fully local with
  zero chain dependency. Block ownership/publishing is a chain capability;
  authoring/playing content needs no chain.

This is why the engine can stand alone — the chain is one optional exit, not a
runtime prerequisite.

## 7. Why it is designed this way (one-page recap)

| Design choice | For the sake of |
|---|---|
| world ← block ← adjunct, three containers | ownership, streaming, content-addressing share one boundary (the 16 m block) |
| everything is a data vocabulary (data is logic) | cross-engine (swap the renderer, keep the content) + one safety chain with human-written content + AI can generate it directly |
| time/weather/items/generation derived from seeds/chain sources | cross-engine agreement + no central server + the iNFT property |
| five modes + zone-gated Game | ordered spatial access and gameplay pacing, not a free toggle |
| local-first, chain-optional | standalone is the default; the chain is an optional overlay |

In one line: **content = protocol data, geometry = deterministic recipe,
time/weather = pure functions, rendering = a pluggable tail** — four layers that
evolve independently. That is why the Septopus 3D engine looks the way it does.

---

*Protocol v0.1 (engine v0.1.0).*
