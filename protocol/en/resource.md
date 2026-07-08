# Septopus Resource Protocol

> **Revised (2026-07-08)** to align with [envelope](envelope.md) — the split of
> concerns: envelope owns "what content looks like" (document shape / CID /
> versioning discipline); this document owns "how content is catalogued, owned
> and fetched" (integer id → CID registry, ownership, fetch flow). CIDs are the
> real CIDv1 of envelope §1 (`bafk…`; v0 `Qm…` read-only compatible). The
> on-chain registry is an **optional publish/ownership tier** (the chain is
> decoupled, see root CLAUDE); its local-first stand-ins are the asset manifest
> + the gateway name index (envelope §5 — a registry is "an on-chain, owned
> name index").

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
| `checksum` | `string` | Content checksum. **Note (2026-07-08)**: redundant under CIDv1 — the CID *is* the sha256 and readers re-hash per envelope §1; kept only for legacy v0 `Qm…` compatibility |

## 4. IPFS Content Format (revised 2026-07-08)

> **The old unified `{index, type, format, raw}` wrapper is deprecated.** It
> base64-wrapped binary media inside JSON and addressed the wrapper, so the CID
> was computed over the wrapper rather than the media bytes — the same texture
> would **never** share a CID with the rest of the IPFS world (interoperability
> lost), and base64 inflates size ~33%. Implementations must not produce it;
> readers **may** still read legacy wrappers.

Current rule (matching [envelope.md](envelope.md) §2/§3):

- **Binary media** (texture/module/audio/avatar/wasm…): **raw bytes straight
  into the CAS** — the CID is the CID of the media bytes, interoperable with any
  IPFS participant; `type`/`format` metadata rides on the registry entry (§3) /
  name index, **not** wrapped into the content.
- **Native Septopus JSON documents** (game config, multilingual text, levels /
  blocks / stylepacks / modules): the uniform envelope of envelope §2 —
  `{format: "septopus.<kind>", version, meta, payload}`.

**text example** (enveloped):

```json
{
  "format": "septopus.text",
  "version": 1,
  "meta": { "name": "greetings" },
  "entries": { "zh-CN": ["你好", "欢迎"], "en-US": ["Hello", "Welcome"] }
}
```

**texture/module example**: no wrapper — the PNG/GLB file bytes themselves;
`bafk(bytes)` is their CID.

## 5. Fetch Flow

```
Engine needs resource #999
    │
    ├→ 1. Query on-chain Registry: id=999 → cid="Qm..."
    ├→ 2. Check local cache (IndexedDB/memory) for this CID
    │      ├→ Hit: use cached data, skip to step 5
    │      └→ Miss: continue
    ├→ 3. Fetch from IPFS gateway: gateway/ipfs/Qm...
    ├→ 4. Re-hash and compare against the CID (envelope §1 integrity; checksum only for legacy v0)
    └→ 5. Binary → hand to the loader per registry type; JSON → validate envelope, extract payload (envelope §2)
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
| Block playable flag / external app id | `block raw[4]` (see [block.md](block.md) §3) | `raw[4] = 42` → external game #42 |
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
