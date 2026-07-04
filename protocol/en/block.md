# Septopus Block Protocol

The **Septopus Engine** defines a "Block" (地块) as the most fundamental, indivisible **atomic spatial container** within a world. It is essentially a geographic slot for housing various types of content from different sources.

A Block has no inherent or necessary tie to a specific organization protocol like SPP. It can accommodate adjuncts deployed through standard methods, as well as complex string particle structures deployed through a special **`spp` adjunct** (acting as a parsing agent).

## 1. Core Properties

A Block is not just a visual unit; it represents digital real estate and carries state and ownership metadata.

- **Unique Ownership**: A Block can only have a single owner at any given time. However, a single Player (Owner) can own multiple Blocks.
- **Economic Asset**: Blocks are tradable entities within the ecosystem.
- **Abandonment & Re-claiming**:
    - A Block can be voluntarily discarded by its owner. Once discarded, it enters a public pool where any Player can claim it.
    - **Decay System**: If a Block receives no updates or interactions for 100 in-world years, it is classified as "Abandoned" (荒废) and automatically becomes claimable by any Player.
- **Geography**: A Block can define its own base elevation, enabling the creation of varied terrain (mountains, valleys) when stitched together with neighboring Blocks.
- **State Configuration**: A Block can store encoded state flags to implement predefined macroscopic functions (e.g., designating a block as a "Safe Zone" or "Event Area").

## 2. Relationship with Adjuncts

While Blocks define the stable ground and absolute coordinates of the world, **Adjuncts** (附属物) provide the interactive objects and dynamic content.

- All Adjuncts mathematically position themselves relative to their parent Block's coordinate system.
- The Block acts as the spatial anchor. If a Block is moved, all Adjuncts anchored to it move with it.

## 3. Block raw format (Normative)

A block's content is a **5-tuple array**:

```
[ elevation, status, adjuncts, animations, game ]
```

| Slot | Field | Type/default | Notes |
|---|---|---|---|
| 0 | `elevation` | number, default `0` | base altitude (m). Ground and every adjunct lift together — join neighbouring blocks with b4 slopes to shape valleys/plateaus |
| 1 | `status` | number, default `1` | status bits (reserved; `1` = normal) |
| 2 | `adjuncts` | `[[typeId, [row…]], …]` | adjunct groups: raw rows grouped by type id. **Per-type slot specs: [adjunct-types.md](adjunct-types.md)** |
| 3 | `animations` | array, default `[]` | block-level animations (reserved) |
| 4 | `game` | number, default `0` | **playable flag**: `≥1` = Game mode may be entered in this block (zone gate; the rich game declaration lives on a b8 game trigger — this bit exists for cheap map enumeration) |

- The empty block is `[0, 1, [], [], 0]`; implementations must tolerate missing
  slots and take the defaults.
- **Serialization invariant**: runtime-derived entities (SPP/motif expansions,
  spawned entities) are **never** written back into raw — only source rows
  persist. Row budgets (reference: 64/block) count authored rows only.
- A local draft (unpublished edit) overlays the canonical data at the same
  coordinate; published content may enter content-addressed storage (CID).

## 4. Storage and Scaling

Each Block can be serialized into a specific data format (such as the String Particle Protocol collapse string) as needed. Because of its atomic nature, worlds can be dynamically loaded or unloaded (sharded) on a per-Block basis by the engine, allowing for infinitely scaling environments without overwhelming client memory.
