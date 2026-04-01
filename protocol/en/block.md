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

## 3. Storage and Scaling

Each Block can be serialized into a specific data format (such as SPP string) as needed. Because of its atomic nature, worlds can be dynamically loaded or unloaded (sharded) on a per-Block basis by the engine, allowing for infinitely scaling environments without overwhelming client memory.
