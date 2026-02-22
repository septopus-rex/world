# SPP Block Protocol

The **String Particle Protocol (SPP)** defines a "Block" (地块) as the fundamental, atomic spatial data unit of an SPP World. By composing individual Blocks together, a complete, continuous virtual environment is constructed.

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

Each Block is serialized into the SPP string format. Because of its atomic nature, worlds can be dynamically loaded or unloaded (sharded) on a per-Block basis by the engine, allowing for infinitely scaling environments without overwhelming client memory.
