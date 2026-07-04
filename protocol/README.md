**English** | [中文](README.cn.md)

# Septopus World Protocol

The Septopus World Protocol defines a **cross-engine, pure-data 3D world**:
worlds, blocks, adjuncts, interactions and gameplay are all plain data with
pinned deterministic semantics. Any engine that implements this protocol must
resolve the same data into the same world — the TypeScript engine in this
repository (`engine/src`) is the **reference implementation**, not the
definition.

- **Version**: protocol **v0.1** (aligned with engine release `v0.1.0`).
  Changes are recorded in the root [CHANGELOG](../CHANGELOG.md) and must land
  in **both** `cn/` and `en/`.
- **Conformance**: see [determinism](en/determinism.md) — the base PRNG, the
  derivation pins, and the acceptance checklist.

## Terminology (normative)

- **SPP is reserved exclusively for the String Particle Protocol** — the
  spatial collapse/expansion protocol, maintained independently at
  [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol) and
  consumed by the engine through the b6 particle adjunct.
- The data frame is always called the **Septopus axis order / frame**
  (X east, Y north, Z up) — never "SPP coordinates". The property timeline is
  the **Septopus animation** protocol.
- History note: early documents and some code identifiers once used "spp" as a
  shorthand for Septopus coordinates (e.g. `sppToEngine`); docs and identifiers
  were unified on 2026-07-04 (`septopusToEngine` etc.).

## Documentation tiers

| Tier | Location | Nature |
|---|---|---|
| **Protocol** | `protocol/en` · `protocol/cn` | Normative — the cross-engine contract |
| **Reference implementation** | [`docs/`](../docs/) | How THIS engine implements it |
| **Process** | [`docs/plan/`](../docs/plan/) | Roadmap & design specs (non-normative) |

## Index

**New here? Read [overview](en/overview.md) first** — what a Septopus world is
made of and why it is designed this way.

| Document | Contents |
|---|---|
| [**overview**](en/overview.md) | **the whole picture: world←block←adjunct, time/weather derivation, why it's data-driven** |
| [world](en/world.md) | world grid / lords / ecosystem; **§3.1 time & weather derivation, §5 coordinate & rotation contract (normative)** |
| [block](en/block.md) | block asset semantics; **§3 raw 5-tuple (normative)** |
| [adjunct](en/adjunct.md) | adjunct architecture, lifecycle, loading pipeline |
| [**adjunct-types**](en/adjunct-types.md) | **per-slot specs for all 18 built-in types (the normative core)** |
| [trigger](en/trigger.md) | events + conditions + the action vocabulary (**all actuator actions, teleport anchors**) |
| [**determinism**](en/determinism.md) | **base PRNG, derivation pins, conformance checklist** |
| [item](en/item.md) | item instance = (template, seed) deterministic derivation (normative) |
| [game](en/game.md) | game sessions / modes; **§9 session & verification protocol (normative)** |
| [animation](en/animation.md) | Septopus data-driven animation timelines |
| [avatar-animation](en/avatar-animation.md) | avatar look/motion/state three-layer contract (VRM baseline) |
| [player](en/player.md) | player capability surface & motion semantics |
| [resource](en/resource.md) | resource addressing (id/CID/URL) & loading semantics |
| [framework](en/framework.md) | engine organization reference (implementation-leaning) |
| [ui](en/ui.md) | host UI event surface (implementation-leaning) |

## Related

- **SPP (String Particle Protocol)** — the semantic-space organization
  protocol, maintained independently at
  [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol).
- Reference engine & PWA client: this repository — see the root
  [README](../README.md) and
  [Releases](https://github.com/septopus-rex/world/releases).
