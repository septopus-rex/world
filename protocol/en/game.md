# Septopus Game Mode Protocol

**Game Mode** is a special runtime state of the Septopus Engine that provides creators with a controlled gameplay environment. Upon entering Game Mode, the engine switches to a sandboxed state: pre-loading required resources, activating full trigger permissions, and isolating external data access to ensure performance and security.

## 1. Game Setting Data Structure

Game Settings are stored on-chain (at the Block or World level) and define all configuration needed to launch Game Mode. Any compatible engine implementation can allow players to enter Game Mode when this setting is detected.

```json
{
    "blocks": [
        [1982, 619],
        [1983, 619, 5, 5]
    ],
    "init": {
        "sky": {},
        "weather": {},
        "start": {
            "block": [1983, 620],
            "position": [8, 8, 0],
            "rotation": [0, 0, 0]
        },
        "server": {}
    }
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `blocks` | `Array` | ✅ | Pre-load regions. `[x, y]` for a single block, `[x, y, ex, ey]` for a rectangular area |
| `init.sky` | `Object` | ❌ | Sky override for game atmosphere |
| `init.weather` | `Object` | ❌ | Weather override for game atmosphere |
| `init.start` | `Object` | ❌ | Game start location; `block` must be within `blocks` range |
| `init.server` | `Object` | ❌ | Game server communication configuration |

### Pre-load Region Format

- **Single Block**: `[x, y]` — load the block at coordinates (x, y)
- **Rectangular Area**: `[x, y, extend_x, extend_y]` — load a rectangle starting at (x, y) with width extend_x and depth extend_y

## 2. Game API Whitelist

In Game Mode, the engine only permits communication with pre-defined external APIs. API definitions are stored in plaintext on-chain and use the same parameter constraint format as triggers.

```json
{
    "game": "fly",
    "baseurl": "https://game_API.fun",
    "methods": [
        {
            "name": "start",
            "params": [],
            "response": [
                { "type": "string", "length": 12 }
            ]
        },
        {
            "name": "end",
            "params": [],
            "response": [
                { "type": "string", "length": 12 }
            ]
        },
        {
            "name": "view",
            "params": [
                { "type": "number", "limit": [0, 255] },
                { "type": "string", "limit": [0, 30] }
            ],
            "response": [
                { "key": "data", "format": "string" }
            ]
        }
    ]
}
```

### Required Methods

| Method | Description |
|---|---|
| `start` | Called on game start; the game server initializes the runtime environment |
| `end` | Called on normal game completion; the game server receives result data |

Additional methods are optional extensions defined by creators based on gameplay requirements.

### Parameter Constraint Format

| Field | Description |
|---|---|
| `type` | Parameter type: `"number"` / `"string"` |
| `limit` | Numeric range `[min, max]` or string length limit `[min_len, max_len]` |
| `length` | Fixed length (response only) |

## 3. Security Model

### 3.1 Network Isolation

Upon entering Game Mode, the engine **terminates all standard DataSource API access**. Only communication with endpoints defined in the Game API Whitelist is permitted.

**Isolation Purpose:**
- **Performance**: No other blocks are loaded; no interference from external data updates
- **Security**: DataSource APIs contain contract call methods; isolation prevents game logic from indirectly triggering on-chain operations

DataSource access is restored upon exiting Game Mode.

### 3.2 Trigger Permission Escalation

In Game Mode, trigger execution permissions are expanded:

| Mode | Environment Changes | Animation | Inventory Modification | Health/Stat Modification |
|---|---|---|---|---|
| **Normal** | ✅ | ✅ | ❌ | ❌ |
| **Game** | ✅ | ✅ | ✅ | ✅ |
| **Ghost** | ❌ | ❌ | ❌ | ❌ |

Trigger actions can be marked with `gameonly: true` to prevent execution outside Game Mode.

## 4. Lifecycle

```
Game Setting detected on a block
    │
    ├→ 1. Pre-load all regions defined in blocks[]
    ├→ 2. Apply init configuration (sky, weather, start position)
    ├→ 3. Terminate DataSource, retain only Game API
    ├→ 4. Call game.start()
    │
    │   [Game Running — triggers have full permissions]
    │
    ├→ 5. Game end condition met → call game.end()
    └→ 6. Restore DataSource, exit Game Mode
```

## 5. World Configuration Mode Declaration

Lords declare permitted operation modes via the world configuration `mode` array:

```json
{
    "world": {
        "mode": ["ghost", "normal", "game"]
    }
}
```

If `"game"` is not included in the `mode` array, all Game Settings within that world are ignored and players cannot enter Game Mode.
