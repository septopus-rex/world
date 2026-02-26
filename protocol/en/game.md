# Septopus Game Mode Protocol

**Game Mode** is a special runtime state of the Septopus Engine that provides creators with a controlled gameplay environment. Upon entering Game Mode, the engine switches to a sandboxed state: pre-loading required resources, activating full trigger permissions, and isolating external data access to ensure performance and security.

Game Mode supports both single-player and multiplayer scenarios. Multiplayer is implemented via WebRTC P2P with no central game server required; advanced game logic can optionally use WASM modules for authoritative computation.

## 1. Storage

Game configuration is stored on-chain as a **Resource**, part of the same resource system as textures and 3D models. For the unified storage format and addressing schemes, see the [Resource Protocol](./resource.md).

**Reference in Block raw data:**

```
Block Raw: [ elevation, status, adjuncts, game_setting_resource_id ]
                                           ↑ index 3
```

- `raw[3]` stores a **resource ID** (integer) pointing to the on-chain game configuration resource
- If `raw[3]` is absent or empty, the block has no game configuration
- The engine fetches the full game setting via the `resource(id)` API

**Resource fetch flow:**

```
Block raw[3] = 999 → resource(999) → { type: "game", format: "json", raw: { ... } }
```

## 2. Game Setting Data Structure

Full game configuration retrieved via the resource API:

```json
{
    "type": "game",
    "format": "json",
    "raw": {
        "game": "parkour",
        "baseurl": "https://game_API.fun",
        "homepage": "",
        "version": "1.0.1",
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
            "server": {
                "stun": "stun:stun.septopus.xyz:3478",
                "maxPlayers": 2
            }
        },
        "sync": "position",
        "wasm": null,
        "methods": [
            {
                "name": "start",
                "params": [],
                "response": [{ "type": "string", "length": 12 }]
            },
            {
                "name": "end",
                "params": [],
                "response": [{ "type": "string", "length": 12 }]
            }
        ]
    }
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `game` | `string` | ✅ | Game name/identifier |
| `baseurl` | `string` | ❌ | Game API root URL (omittable for pure P2P games) |
| `homepage` | `string` | ❌ | Game homepage URL |
| `version` | `string` | ❌ | Game version |
| `blocks` | `Array` | ✅ | Pre-load region list |
| `init.sky` | `Object` | ❌ | Sky override for atmosphere |
| `init.weather` | `Object` | ❌ | Weather override for atmosphere |
| `init.start` | `Object` | ❌ | Start location; `block` must be within `blocks` range |
| `init.server` | `Object` | ❌ | Multiplayer network config (see Section 7) |
| `sync` | `string` | ❌ | Sync level (see Section 7); `null` = single player |
| `wasm` | `number` | ❌ | WASM game logic resource ID (see Section 8) |
| `methods` | `Array` | ❌ | API whitelist method definitions |

### Pre-load Region Format

- **Single Block**: `[x, y]` — load the block at coordinates (x, y)
- **Rectangular Area**: `[x, y, extend_x, extend_y]` — rectangular region; engine auto-extends +2 blocks as buffer

Coordinates are **absolute**.

## 3. Game API Whitelist

In Game Mode, if `methods` is provided, the engine only permits communication with the defined endpoints.

### Required Methods

| Method | Description |
|---|---|
| `start` | Called on game start; server initializes runtime environment |
| `end` | Called on game completion; server receives result data |

### Parameter Constraint Format

| Field | Description |
|---|---|
| `type` | Parameter type: `"number"` / `"string"` |
| `limit` | Numeric range `[min, max]` or string length limit |
| `length` | Fixed length (response only) |

> [!NOTE]
> Pure P2P mini-games (parkour, mazes) don't need external APIs. In this case `baseurl` and `methods` can be omitted; all logic is handled by engine triggers + WebRTC sync.

## 4. Security Model

### 4.1 Network Isolation

Upon entering Game Mode, the engine **terminates all standard DataSource API access**. Only the following are permitted:
- Game API Whitelist endpoints (if defined)
- WebRTC P2P connections (if multiplayer is configured)

**Isolation Purpose:**
- **Performance**: No other blocks loaded; no interference from external data updates
- **Security**: DataSource APIs contain contract call methods; isolation prevents indirect on-chain operations

DataSource access is restored upon exiting Game Mode.

### 4.2 `gameonly` Dual-Layer Control

The `gameonly` flag exists at two levels:

**① Trigger level** — entire trigger only activates in Game Mode:

```
Trigger Raw: [ size, position, rotation, shape, event, actions, contractId, runOnce, gameOnly ]
                                                                                      ↑ index 8
```

`raw[8] = 1` means the trigger only activates in Game Mode.

**② Method level** — individual task methods restricted to Game Mode:

```javascript
task.router: [
    { method: "hide", gameonly: true },
    { method: "show", gameonly: true },
    { method: "dance", gameonly: true }
]
```

### 4.3 Trigger Permission Matrix

| Mode | Environment Changes | Animation | Inventory Modification | Health/Stat Modification |
|---|---|---|---|---|
| **Normal** | ✅ | ✅ | ❌ | ❌ |
| **Game** | ✅ | ✅ | ✅ | ✅ |
| **Ghost** | ❌ | ❌ | ❌ | ❌ |

## 5. Lifecycle

### 5.1 Single Player

```
Block raw[3] contains a resource ID
    │
    ├→ 1. resource(id) fetches full Game Setting
    ├→ 2. Pre-load all regions in blocks[] (engine auto-extends +2 buffer)
    ├→ 3. Apply init configuration (sky, weather, start position)
    ├→ 4. Terminate DataSource, retain only Game API
    ├→ 5. Call game.start()
    │
    │   [Game Running — triggers have full permissions]
    │
    ├→ 6. Game end condition met → call game.end()
    └→ 7. Restore DataSource, exit Game Mode
```

### 5.2 Multiplayer

```
Player A enters Game Mode (becomes Host)
    │
    ├→ 1-5. Same as single player
    ├→ 6. Start WebRTC signaling, generate Room ID
    ├→ 7. Wait for other players to join (via Room ID)
    │
Player B joins
    │
    ├→ 1-4. Same as single player (independently loads same map)
    ├→ 5. Connect to Host via Room ID over WebRTC DataChannel
    ├→ 6. If WASM present → download same WASM module
    ├→ 7. Begin sync (exchange data per sync level)
    │
    │   [Game Running — both run physics/triggers independently, WebRTC syncs state]
    │
    ├→ 8. Any player meets end condition → broadcast end event
    └→ 9. Both exit Game Mode
```

## 6. World Configuration Mode Declaration

Lords declare permitted operation modes via the world configuration `mode` array:

```json
{
    "world": {
        "mode": ["ghost", "normal", "game"]
    }
}
```

If `"game"` is not included in the `mode` array, all Game Settings within that world are ignored.

## 7. Multiplayer Sync

### 7.1 Sync Levels

The `sync` field defines the synchronization granularity required:

| sync value | Level | Synced Content | Use Cases |
|---|---|---|---|
| `null` | — | No sync (single player) | Solo parkour, puzzles |
| `"position"` | L1 | Position + rotation + animation state | Parkour races, speedruns |
| `"state"` | L2 | L1 + trigger state change events | Co-op puzzles, escape rooms |
| `"inventory"` | L3 | L2 + inventory/item changes | Treasure hunts, collection games |
| `"authority"` | L4 | L3 + WASM authoritative results | PvP combat (requires `wasm` field) |

Each level includes all sync content from previous levels.

### 7.2 WebRTC P2P Connection

Multiplayer uses WebRTC DataChannel for direct player-to-player data transfer, requiring no central game server.

**`init.server` configuration:**

```json
{
    "server": {
        "stun": "stun:stun.septopus.xyz:3478",
        "turn": "turn:turn.septopus.xyz:3478",
        "turnUser": "sept",
        "turnPass": "****",
        "maxPlayers": 4
    }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `stun` | `string` | ✅ | STUN server address for NAT traversal |
| `turn` | `string` | ❌ | TURN relay server (fallback when NAT traversal fails) |
| `turnUser` | `string` | ❌ | TURN auth username |
| `turnPass` | `string` | ❌ | TURN auth password |
| `maxPlayers` | `number` | ❌ | Max players, default 2, recommended ≤8 |

**Connection topology:** Direct (Mesh) for 2 players; Host-centric (Star) for 3+.

### 7.3 Sync Data Format

WebRTC DataChannel uses Binary ArrayBuffer to minimize bandwidth:

```
L1 (position): ~40 bytes per frame
┌──────┬──────────────────────┬──────────────────────┬──────────┐
│ type │ position (3×float32) │ rotation (3×float32) │ animState│
│ 1B   │ 12B                  │ 12B                  │ 2B       │
└──────┴──────────────────────┴──────────────────────┴──────────┘

L2 (state): event-driven, sent only on trigger state changes
┌──────┬───────────┬──────────────┬──────────┐
│ type │ triggerId │ eventType    │ payload  │
│ 1B   │ 2B        │ 1B           │ N bytes  │
└──────┴───────────┴──────────────┴──────────┘

L3 (inventory): event-driven
┌──────┬──────────┬──────────┬──────────┐
│ type │ itemId   │ action   │ amount   │
│ 1B   │ 2B       │ 1B       │ 2B       │
└──────┴──────────┴──────────┴──────────┘
```

## 8. WASM Game Logic (Optional)

For games requiring authoritative computation (L4 sync level), deterministic game logic can be implemented via WASM modules.

### 8.1 Storage

WASM binaries are stored as Resources on IPFS (type: `"wasm"`). Game Setting references the resource ID via the `wasm` field.

```json
{ "wasm": 1001 }
```

Engine load flow: `resource(1001)` → fetch WASM binary → instantiate WebAssembly Module.

### 8.2 Execution Model

```
Host (Player A)                  Client (Player B)
┌─────────────────────┐        ┌──────────────────────┐
│ WASM Instance        │        │ WASM Instance (same) │
│ - Receives all input │        │ - Receives all input │
│ - Computes authority │ WebRTC │ - Local prediction   │
│ - Broadcasts result ─│───────→│ - Verifies on receipt│
│                     │←───────│ - Host wins conflicts│
└─────────────────────┘        └──────────────────────┘
```

### 8.3 Determinism Requirements

Both WASM instances must produce identical output for identical input:
- Use **fixed-point arithmetic** (integer-based) to avoid floating-point drift
- Random numbers use a **shared seed** (generated by Host at game.start and broadcast)
- WASM modules must not access system time, DOM, or other non-deterministic APIs

### 8.4 When to Use WASM

| Needs WASM | No WASM Needed |
|---|---|
| Damage/hit detection | Parkour/racing |
| Item drop probabilities | Co-op puzzles |
| Turn-based combat resolution | Escape rooms |
| Anti-cheat for leaderboards | Treasure hunts/exploration |

> [!TIP]
> Most casual mini-games (parkour, mazes, puzzles) only need L1/L2 sync and no WASM. WASM is only introduced when authoritative arbitration is needed (e.g., PvP damage calculation).
