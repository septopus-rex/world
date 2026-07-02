# Septopus World Protocol

Within the **Septopus Engine**, a "World" (`world`) is the highest-level administrative and physical bounding box. A Septopus World consists of a continuous grid of Blocks, and is governed by global physics, atmospheric conditions, and access rules enforced by the engine. Content organization within these blocks (e.g., via the SPP protocol) is a specific implementation layer within this management framework.

## 1. World Architecture & Layout

The Septopus metaverse is composed of a fixed number of overarching Worlds.
*   **Total Worlds**: 96 individual Worlds.
*   **Macro Structure**: The 96 worlds are mathematically mapped onto the 6 faces of a massive cosmic cube (4x4 worlds per face).
*   **World Dimensions**: A single World is a bounded grid of `4096 x 4096` Blocks.
*   **Block Dimensions**: A single Block represents an area of `16m x 16m`.

## 2. Administration & The "Lord" (领主)

Each World is a distinct sovereign territory owned by a "Lord." The Lord holds an administrative NFT or cryptographic key that grants permission to modify the World's global parameters on the blockchain.

**Lord Capabilities:**
*   **Monetization & Taxes**: The Lord can set economic policies or sell/transfer the Lordship to another entity.
*   **Aesthetic Overrides**: The Lord can change the default terrain textures, default ground color, and base elevation of the unowned wilderness blocks.
*   **Access Control**: The Lord decides which operation modes are permitted (e.g., banning "Ghost" spectators or enforcing "Game-Only" scenarios).

## 3. Global Ecosystem Configurations

Worlds share a foundational set of physical laws (Immutable Data) but allow the Lord to tweak specific atmospheric dials (Mutable Data).

### Immutable Configuration (System Level)
Set upon the genesis of the Septopus Engine and cannot be altered by individual Lords.
- **Time Dilation**: E.g., The ratio of Septopus Time to Real-World Time (default 20x faster).
- **Celestial Bodies**: Standardized skybox configurations (1 Sun, 3 Moons).
- **Maximum Block Expansion**: The hard limit of `4096 x 4096`.

### 3.1 Deterministic Time & Weather Derivation (Normative)

> "Data is logic": world time and weather derive as pure functions of **chain
> height + chain hash** — any engine (TS / UE) must produce the SAME moment and
> the SAME rain for the same inputs. Reference implementation:
> `engine/src/core/systems/EnvironmentSystem.ts`.

**Inputs**: `height` (chain block height), `hash` (`0x`-prefixed hex string,
length ≥ 20), `interval` (chain block interval, seconds), `epoch` (genesis start
height, default 0), `speed` (time-flow multiplier, default 1.0).

**World time** (fixed-unit calendar):
```
elapsed = max(0, height − epoch) × interval × speed        (seconds)
year  = elapsed ÷ 31104000 (= 360 days), then with the remainder:
month = ÷ 2592000 (= 30 days) · day = ÷ 86400 · hour = ÷ 3600 · minute = ÷ 60 · second = remainder
```
Every unit is assigned **unconditionally** (crossing a day boundary must reset
the lower units to 0, never keep stale values).

**Weather** (hash slices; character positions count **after stripping the `0x`
prefix**, 0-based):
```
category = parseInt(hash[10..11], 16) mod 4  →  0 clear · 1 cloud · 2 rain · 3 snow
grade    = parseInt(hash[12..13], 16) mod 4  →  0..3 (intensity)
```
A slice that fails to parse counts as 0. **Thunderstorm predicate**:
`category == rain && grade ≥ 1`.

**Semantic / renderer boundary**: `(time, category, grade, storm predicate)` are
**semantic** (must match across engines); sun angle, light intensities, the
lightning flash envelope and particle density are **renderer-defined**
(behavior-equivalent, per the adjunct protocol §6 "same effect" boundary).

### Mutable Configuration (Lord Level)
Stored in a smart contract and configurable by the World's Lord.
```json
{
    "world": {     
        "nickname": "Neon Genesis",        
        "mode": ["ghost", "normal", "game"],     
        "accuracy": 1000     
    },
    "block": {     
        "elevation": 0,       
        "max": 30,            
        "color": 0x10b981,     
        "texture": 2          
    },
    "player": {
        "start": {
            "block": [2025, 619],   
            "position": [8, 8, 0],   
            "rotation": [0, 0, 0]   
        }
    }
}
```

### Configuration Hierarchy
1.  **Septopus Engine Core Config**: The immutable laws of the engine.
2.  **World Config**: The Lord's customized environment.
3.  **Avatar/Block Config**: Individual Player or Landowner localized data overrides.
