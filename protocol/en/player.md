# Septopus Player Protocol

Within the **Septopus engine**, the "Player" is not just a viewpoint but an interactive unit that follows physical rules and has a visual representation (Avatar) in the world. Its position and state are tracked in real time by the engine and interact deeply with content organized via SPP.

> This document maps to the implementation: state container & persistence in
> `client/desktop/src/lib/DesktopLoader.ts` (`SPPPlayerState`), state reporting in
> `engine/src/core/movement/CharacterController.ts`, avatar loading in
> `engine/src/core/EntityFactory.ts`, component definitions in
> `engine/src/core/components/PlayerComponents.ts`.

## 1. Player Spatial State

The player's core persisted state format (client-side `SPPPlayerState`, stored in
localStorage `spp_player_state`, restored on reload for seamless continuation):

```json
{
    "block": [2048, 2048],
    "world": "main",
    "position": [8, 8, 1.0],
    "rotation": [0, 0, 0],
    "stop": { "on": false, "adjunct": "", "index": 0 },
    "extend": 2,
    "posture": 0
}
```

### Field reference and implementation status

| Field | Description | Status |
|---|---|---|
| `block` | `[X, Y]` coordinates of the player's current block. | ✅ dynamically reported by the engine |
| `position` | `[X, Y, Z]` coordinates **relative to the current block** (SPP axes, Z = altitude). | ✅ dynamically reported |
| `rotation` | View Euler rotation `[X, Y, Z]` (SPP convention). | ✅ dynamically reported |
| `world` | World ID (`string \| number`). | ⚠️ carried in the container; engine is single-world for now, never updated dynamically |
| `extend` | Viewport loading radius (rings of neighboring blocks; `2` = 5×5). | ✅ used by the client streamer (clamped to ≥ 2); a static twin also exists in world config `player.extend` |
| `stop` | What the player stands on (`on`/`adjunct`/`index`), the fall reference. | 🚧 **Reserved** — kept in the container, never updated by the engine (groundedness lives internally in `RigidBodyComponent.isGrounded`) |
| `posture` | Posture enum (stand/walk/run/climb/squat/prone). | 🚧 **Reserved** — the engine has no posture state machine |

### State reporting (the `player:state` event)

The engine does not persist every frame: `CharacterController.processPersistence`
emits a `player:state` event when movement/rotation **crosses a threshold**, with
payload **`{ block, position, rotation }`** (converted back to SPP coordinates via
`Coords.engineToSpp`). The client merges it into the container above and writes
localStorage — the remaining fields (`stop`/`posture` etc.) ride along as container
defaults.

## 2. Terrain & Gravity

The engine continuously resolves player-vs-terrain/adjunct collisions:

- **Substepped integration**: each frame's displacement is sliced into ≤ 0.08 m
  substeps (max 48), so fast movement cannot tunnel through thin walls.
- **Step rule (single threshold)**: if an obstacle's top is within `stepHeight`
  (default 0.5 m) of the feet, the player steps up automatically; otherwise it
  blocks horizontally. This one rule covers all transitions (block→adjunct,
  adjunct→adjunct, adjunct→block).
- **Fall events**: falling start height is recorded on leaving the ground; on
  landing, if the drop ≥ `fallDeathHeight` (default 12 m) the engine emits
  **`player:fell`** with `{ drop }` (consequences — respawn, damage — are up to
  the listener).
- **Void failsafe**: falling out of the world resets the player to the last safe
  spot and emits `player:recovered`.

### Body parameters (`PlayerBodyComponent`)

| Field | Description | Status |
|---|---|---|
| `height` | Collision column height (m) | ✅ |
| `eyeHeight` | Eye height above feet (camera offset, m) | ✅ |
| `stepHeight` | The single step-over/block threshold (m) | ✅ |
| `fallDeathHeight` | Drop distance (m) that emits `player:fell` | ✅ |
| `crouchHeight` | Crouch height | 🚧 reserved |
| `jumpHeight` | Target jump apex (impulse currently driven by `RigidBodyComponent.jumpForce`) | 🚧 reserved |

Movement capacities live in `RigidBodyComponent`: `maxSpeedWalk` / `maxSpeedRun` /
`jumpForce` / `gravity` / `friction` / `isGrounded`.

> ⚠️ In world config, `player.capacity` (rotate/speed/jumpForce/gravityMultiplier),
> `player.body` (head/hand/leg segments) and `player.bag.max` are **reserved
> types** — the engine hardcodes defaults at player creation and does not read
> them. Setting them in a king's config has no effect today.

## 3. Avatar

**An avatar IS a model resource**: fetched by id (path / IPFS CID — `resolveUrl`
maps CIDs to gateway URLs) through the `ResourceManager` model pipeline, sharing
the load-once + instance-many channel with modules (a4). There is no parallel
asset path.

### Configuration and loading

```json
// world config (king's config)
"player": {
    "avatar": { "max": 2097152, "scale": [1, 1, 1], "resource": 30 }
}
```

| Field | Description | Status |
|---|---|---|
| `resource` | Model resource id (resolved via `IDataSource.module()` to `{format, raw: <path/CID>}`) | ✅ the only field the engine consumes |
| `scale` | Body scaling | 🚧 **Reserved** — the engine scales uniformly to body height and ignores this field |
| `max` | Avatar file size cap (bytes) | 🚧 **Reserved** — not validated |

Loading flow (`EntityFactory.loadAvatarModel`):

1. A **placeholder box** (translucent, 0.6×1.8×0.6) shows instantly at spawn.
2. `ResourceManager.getModel(resource)` loads asynchronously (deduped by id —
   multiple players sharing an id load the file once and each gets a clone;
   multiplayer-ready dedup).
3. On success the model is **uniformly scaled to body height** (aspect preserved,
   never stretched) and swapped in for the placeholder; on failure the placeholder
   stays.
4. Skeletal animation clips embedded in the model (`AnimationClip`) auto-play via
   the render layer's `RenderEngine.startAnimation` — **the first clip** — with the
   mixer advanced each frame by `CharacterController`.

**Supported formats**: GLTF/GLB, FBX, OBJ, DAE (`ModelLoader`). **VRM is not
supported yet.**

**Visibility**: the avatar renders only in third-person view (in first-person the
camera sits inside it, so it is force-hidden).

### Not implemented / planned

The following are legacy-protocol target-state descriptions — **none are
implemented**; listed to prevent mis-citation:

- **Posture animation set**: Stand/Walk/Run/Squat/Prone/Climb clips bound to
  `posture` and switched by movement state (currently only the first embedded clip
  auto-plays).
- **Emote system**: Normal/Happy/Angry/Sad blendshapes with intensity ramps.
- **Standalone avatar metadata file** (`{body, action, emotion, datasource,
  format}`): there is no metadata layer today — an avatar is just "a model
  resource id". If rig retargeting, animation-set declarations, or collision body
  matching are needed later, a dedicated `IDataSource.avatar()` metadata interface
  can be introduced.
- **Body retargeting**: matching the collision capsule to body parameters
  (height/shoulder width). Today the collision column and the model are mutually
  unaware; only whole-model uniform scaling is applied.

The decentralization direction stands: avatars are content-addressed (IPFS CID)
and the loading pipeline already resolves CIDs; chain/IPFS publishing belongs to
P3–P4.
