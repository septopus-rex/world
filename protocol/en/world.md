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
