# Septopus Resource Protocol

**Resources** are the unified abstraction for all external data in the Septopus Engine. Textures, 3D models, game configurations, text content, audio, contract IDLs, and more are all addressed and fetched through the same resource system.

## 1. Storage Architecture

Resources use a **two-layer architecture: on-chain registry + IPFS storage**.

```
Solana (On-Chain)                        IPFS (Content Layer)
┌────────────────────────┐              ┌─────────────────────────┐
│  Resource Registry     │              │                         │
│  ┌──────────────────┐  │   CID ref    │  { index, type, format, │
│  │ ID: 2            │──│─────────────→│    raw: actual data }   │
│  │ CID: "Qm..."     │  │              │                         │
│  │ owner: "Hx3f..." │  │              │  texture: PNG/JPG blob  │
│  │ size: 102400     │  │              │  module:  GLB/FBX blob  │
│  │ checksum: "ab.." │  │              │  game:    JSON config   │
│  └──────────────────┘  │              │  text:    i18n JSON     │
│                        │              │  audio:   MP3/OGG blob  │
│  Block Raw Data        │              │                         │
│  [elev, status,        │              └─────────────────────────┘
│   adjuncts,            │
│   game_resource_id]    │
└────────────────────────┘
```

**On-Chain (Solana PDA):**
- World config, Block ownership, Block raw data (small structural data)
- **Resource Registry** — mapping from resource ID to IPFS CID

**IPFS:**
- All resource content (regardless of size, unified on IPFS)

## 2. Resource Types

| Type | Identifier | Typical Format | Description |
|---|---|---|---|
| `texture` | Texture | png, jpg | 2D images for adjunct surface materials |
| `module` | Model | glb, fbx | 3D model files |
| `game` | Game Config | json | Game Mode configuration (see [game.md](./game.md)) |
| `text` | Text | json | Multi-language text for trigger UI actions |
| `audio` | Audio | mp3, ogg | 3D spatial audio files |
| `avatar` | Avatar | glb | Player avatar models |
| `idl` | Contract IDL | json | Smart contract interface definitions |
| `wasm` | Game Logic | wasm | WebAssembly modules for Game Mode L4 authoritative computation |

## 3. On-Chain Registry

Each resource has a corresponding Solana PDA account storing metadata:

```json
{
    "id": 999,
    "type": "game",
    "cid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "owner": "Hx3fLYV2Fu7Ewx59PYPofEPJobKxGHru1gUCn5SAMPLE",
    "size": 1024,
    "checksum": "sha256:a1b2c3d4e5f6..."
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Resource ID, globally unique auto-increment |
| `type` | `string` | Resource type identifier |
| `cid` | `string` | IPFS Content Identifier |
| `owner` | `string` | Uploader's wallet address |
| `size` | `number` | Content size in bytes |
| `checksum` | `string` | Content checksum for verifying IPFS download integrity |

## 4. IPFS Content Format

Resource content stored on IPFS uses a unified wrapper format:

```json
{
    "index": 999,
    "type": "game",
    "format": "json",
    "raw": { "game": "running", "blocks": [[2026, 619, 2, 4]], "methods": [] }
}
```

| Field | Type | Description |
|---|---|---|
| `index` | `number` | Resource ID (matches on-chain registry) |
| `type` | `string` | Resource type |
| `format` | `string` | Data format: `"png"`, `"jpg"`, `"glb"`, `"json"`, etc. |
| `raw` | `any` | Actual resource data or binary content |

### Type-Specific `raw` Examples

**texture:**
```json
{ "index": 2, "type": "texture", "format": "jpg", "raw": "<base64 or binary>", "repeat": [1, 1] }
```

**module:**
```json
{ "index": 27, "type": "module", "format": "glb", "raw": "<binary>" }
```

**game:** Full structure defined in [game.md](./game.md)

**text:**
```json
{
    "index": 18, "type": "text", "format": "json",
    "raw": { "zh-CN": ["Hello", "Welcome"], "en-US": ["Hello", "Welcome"] }
}
```

## 5. Fetch Flow

```
Engine needs resource #999
    │
    ├→ 1. Query on-chain Registry: id=999 → cid="Qm..."
    ├→ 2. Check local cache (IndexedDB/memory) for this CID
    │      ├→ Hit: use cached data, skip to step 5
    │      └→ Miss: continue
    ├→ 3. Fetch from IPFS gateway: gateway/ipfs/Qm...
    ├→ 4. Verify checksum to confirm content integrity
    └→ 5. Parse { type, format, raw }, pass to appropriate loader
```

Resource loading properties:
- **Deduplication**: Same CID downloaded only once, globally cached
- **Asynchronous**: Does not block the main render loop
- **Fallback**: Failed loads use default placeholders (default color/geometry)
- **CDN Acceleration**: Production can add CDN cache layer in front of IPFS gateway

## 6. Resource References

Other protocols reference resources via **integer IDs**. At runtime, the engine resolves IDs to CIDs and fetches from IPFS:

| Reference Location | Method | Example |
|---|---|---|
| Adjunct material | `adjunct raw[3]` = resource ID | `raw[3] = 2` → texture #2 |
| Adjunct model | `adjunct raw[3]` = resource ID | `raw[3] = 27` → model #27 |
| Block game config | `block raw[3]` = resource ID | `raw[3] = 999` → game config #999 |
| Trigger UI text | Action parameter resource ID | `system.ui.dialog(18)` → text #18 |

## 7. Update Mechanism

When a resource is updated:
1. Upload new content to IPFS → receive new CID
2. Update on-chain Registry fields: `cid`, `size`, `checksum`
3. Clients detect CID change → re-fetch from IPFS

Old CID content naturally expires on IPFS (garbage collected if unpinned). On-chain history remains traceable.

## 8. Relationship with Other Protocols

```
Resource Protocol (Registry + IPFS Content)
    │
    ├── texture → Adjunct Protocol (material references)
    ├── module  → Adjunct Protocol (model references)
    ├── game    → Game Mode Protocol (game configuration)
    ├── text    → Trigger Protocol (UI text)
    ├── audio   → Adjunct Protocol (spatial audio)
    ├── avatar  → Player Protocol (player avatars)
    ├── idl     → Framework Protocol (contract interfaces)
    └── wasm    → Game Mode Protocol (game logic modules)
```
