# Septopus Player Protocol

Within the **Septopus engine**, the "Player" is not just a viewpoint but an interactive unit that follows physical rules and has a visual representation (Avatar) in the world. Its position and state are tracked in real time by the engine and interact deeply with content organized via SPP.

> This document maps to the implementation: state container & persistence in
> `client/desktop/src/lib/DesktopLoader.ts` (`SeptopusPlayerState`), state reporting in
> `engine/src/core/movement/CharacterController.ts`, avatar loading in
> `engine/src/core/EntityFactory.ts`, component definitions in
> `engine/src/core/components/PlayerComponents.ts`.

## 1. Player Spatial State

The player's core persisted state format (client-side `SeptopusPlayerState`, stored in
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
| `position` | `[X, Y, Z]` coordinates **relative to the current block** (Septopus axes, Z = altitude). | ✅ dynamically reported |
| `rotation` | View Euler rotation `[X, Y, Z]` (Septopus convention). | ✅ dynamically reported |
| `world` | World ID (`string \| number`). | ⚠️ carried in the container; engine is single-world for now, never updated dynamically |
| `extend` | Viewport loading radius (rings of neighboring blocks; `2` = 5×5). | ✅ used by the client streamer (clamped to ≥ 2); a static twin also exists in world config `player.extend` |
| `stop` | What the player stands on (`on`/`adjunct`/`index`), the fall reference. | 🚧 **Reserved** — kept in the container, never updated by the engine (groundedness lives internally in `RigidBodyComponent.isGrounded`) |
| `posture` | Posture enum (stand/walk/run/climb/squat/prone). | 🚧 **Reserved** — the engine has no posture state machine |

### State reporting (the `player:state` event)

The engine does not persist every frame: `CharacterController.processPersistence`
emits a `player:state` event when movement/rotation **crosses a threshold**, with
payload **`{ block, position, rotation }`** (converted back to Septopus coordinates via
`Coords.engineToSeptopus`). The client merges it into the container above and writes
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
  **`player:fell`** with `{ drop }` — `HealthSystem` treats it as lethal (below).
- **Void failsafe**: falling out of the world resets the player to the last safe
  spot and emits `player:recovered`.
- **Ghost mode**: gravity-free, collision-free roaming (Space ascends / Shift
  descends); fall events and the void failsafe are skipped; the avatar is hidden.

### Health & respawn (`HealthComponent` + `HealthSystem`)

The player carries `HealthComponent { hp, maxHp }` (default 100/100). Event flow:

- `player:damage` / `player:heal` `{ amount }` — debit/credit (triggers reach
  this via the actuator's `player` action, **Game mode only**); every change
  broadcasts `player:health { hp, maxHp }`.
- A lethal fall (`player:fell`) or hp ≤ 0 — emits `player:died { cause }`,
  teleports back to the world spawn point, zeroes velocity, restores full hp,
  emits `player:respawned`.
- The client HP bar consumes `player:health` (hidden at full health).

### Body parameters (`PlayerBodyComponent`)

| Field | Description | Status |
|---|---|---|
| `height` | Collision column height (m) — the physics authority, avatar-independent | ✅ |
| `eyeHeight` | Eye-height BASELINE (m); **the live camera eye follows the avatar's declaration** (§3.1) — this value is the physics-side record + the undeclared fallback | ✅ |
| `stepHeight` | The single step-over/block threshold (m) | ✅ |
| `fallDeathHeight` | Drop distance (m) that emits `player:fell` | ✅ |
| `crouchHeight` | Crouch height | 🚧 reserved |
| `jumpHeight` | Target jump apex (impulse currently driven by `RigidBodyComponent.jumpForce`) | 🚧 reserved |

Movement capacities live in `RigidBodyComponent`: `maxSpeedWalk` / `maxSpeedRun` /
`jumpForce` / `gravity` / `friction` / `isGrounded`.

> **Wired (updated 2026-07-09, base-data audit P9)**: `player.capacity`
> (speed/walkSpeed/jumpForce/gravityMultiplier/ghostFlySpeed/voidRecover/**maxHp**/**reach**)
> and `player.physique` are **both read by the engine** — data first, defaults
> below as fallback. **physique = the PHYSICS baseline + the visual fallback
> (split into two layers as of 2026-07-17)** (replaces the removed legacy VBW
> `body` shape, which nothing ever consumed): the collision capsule, step-over
> and jump **always** use the baseline — `height` 1.8 · `stepHeight` 0.5 ·
> `crouchHeight` 0.9 · `jumpHeight` 1.2 · `fallDeathHeight` 12 (fatal fall, m);
> the **visual body (model scale target + camera eye) follows the avatar's own
> DECLARED physique** (§3.1), falling back to the baseline `height` 1.8 /
> `eyeHeight` 1.7 only when undeclared, with declared values world-clamped via
> `physique.avatarHeightRange` (default `[0.5, 3.0]` m). In one line: **the
> world owns physics, the avatar owns visuals, and the parameters are declared
> data**.
> **Embedded-spawn rescue (popOut) is normative**: spawning/teleporting into a
> solid pops the player to the solid's top; the ≤0.08 m walking substep stays
> under the 0.1 m trigger margin, so normal movement never trips it.
> `player.bag.max` **is wired**: it caps the player's bag slots (`InventoryComponent.maxCapacity`);
> the full inventory design lives in the
> [inventory-local-first spec](../../docs/plan/specs/inventory-local-first.md)
> (b5 item adjuncts, atomic pickup/drop, IndexedDB persistence, trigger `bag`
> actions and `inventory.*` conditions).

## 3. Avatar

**An avatar IS a model resource**: fetched by id (path / IPFS CID — `resolveUrl`
maps CIDs to gateway URLs) through the `ResourceManager` model pipeline, sharing
the load-once + instance-many channel with modules (a4). There is no parallel
asset path.

### Configuration and loading

```json
// world config (king's config)
"player": {
    "avatar": { "max": 2097152, "scale": [1, 1, 1], "resource": 33, "facing": 0,
                "physique": { "height": 1.8, "eyeHeight": 1.7 } },
    "avatarCatalog": [
        { "id": 33, "label": "Soldier", "facing": 0,
          "physique": { "height": 1.8, "eyeHeight": 1.7 } },
        { "id": 34, "label": "Robot", "facing": 3.141592653589793,
          "physique": { "height": 2.2, "eyeHeight": 2.0 } }
    ]
}
```

| Field | Description | Status |
|---|---|---|
| `resource` | Model resource id (resolved via `IDataSource.module()` to `{format, raw: <path/CID>}`) | ✅ |
| `facing` | Per-model yaw orientation correction (radians, see animation protocol §7.1) | ✅ |
| `physique` | **Declared visual physique** `{height?, eyeHeight?}` (m) — scale target + camera eye, see §3.1 | ✅ (2026-07-17) |
| `scale` | Body scaling | 🚧 **Reserved** — the engine scale-to-fits the §3.1 declared height and ignores this field |
| `max` | Avatar file size cap (bytes) | 🚧 **Reserved** — not validated |

`avatarCatalog` = the optional avatar catalog (data riding the world doc, consumed
by the client picker); each entry is `{id, label, facing, physique?}` — on swap the
catalog's facing/physique travel with the id.

Loading flow (`EntityFactory.loadAvatarModel`):

1. A **placeholder box** (translucent, 0.6×1.8×0.6) shows instantly at spawn.
2. `ResourceManager.getModel(resource)` loads asynchronously (deduped by id —
   multiple players sharing an id load the file once and each gets a clone;
   multiplayer-ready dedup).
3. On success the model is **uniformly scaled to the avatar's DECLARED height**
   (world baseline when undeclared; aspect preserved, never stretched), swapped in
   for the placeholder, **and the camera eye switches to its declared eyeHeight**
   (§3.1); on failure the placeholder stays (and so does the old eye — the eye
   follows the visible body).
4. Skeletal animation clips embedded in the model (`AnimationClip`) are registered to a
   mixer via `RenderEngine.startAnimation`; `CharacterController` calls `setAnimationState`
   each frame per movement state (idle/walk/run/air + crossfade) and advances the mixer via
   `RenderEngine.updateAnimation` — **embedded clips do play**.
   ⚠️ But the state→clip mapping is a clip-name regex heuristic + fallback to the first clip;
   **form and motion are not separated** (motion is welded into the avatar GLB, no shared
   retargetable library), and there is no standard skeleton contract. The full data contract
   (form/motion/state separation, VRM humanoid skeleton, state set, retargeting, status &
   phasing) is in the **[Avatar Animation Protocol](./avatar-animation.md)**.

**Supported formats**: GLTF/GLB, FBX, OBJ, DAE (`ModelLoader`). **VRM is not
supported yet** (see animation protocol §7 v3).

**Visibility**: the avatar renders only in third-person view (in first-person the
camera sits inside it, so it is force-hidden).

### 3.1 Declared visual physique (normative, 2026-07-17)

**The world owns physics, the avatar owns visuals, and the parameters are declared
data** — §2's physique splits into two layers:

- **Declaration**: an avatar declares `physique: { height?, eyeHeight? }` (metres)
  in its catalog entry / record. The parameters are **data** — **never measured
  from the model's geometry (bbox)**: a bbox is polluted by hats/wings/weapons,
  arrives asynchronously, and can be gamed by the asset author. The bbox is used
  only to derive the scale factor `k = declaredHeight / nativeBboxHeight`.
- **Visuals**: the model uniform-scales to the declared `height`; the camera rides
  the declared `eyeHeight`. Both take effect **the moment the model lands** — a
  failed load keeps the old body AND the old eye, and rapid re-picks resolve to
  the LAST requested avatar (stale-load guard).
- **World clamp**: declared heights are clamped by
  `player.physique.avatarHeightRange` (default `[0.5, 3.0]` m) — the world keeps
  final authority over extreme bodies; the eye can never sit above the head
  (`eyeHeight ≤ height`). A declared height without an eyeHeight derives the eye
  proportionally from the baseline ratio (`baselineEye / baselineHeight`), so the
  camera lands on the face automatically.
- **Physics never reads the declaration**: the collision capsule, step-over and
  jump always use the world physique baseline — swapping avatars **never changes**
  which doorways you fit through, parkour outcomes, or any gameplay (multiplayer
  hitbox normalization; four reasons: fairness, content authored against the
  baseline, synchronous availability at spawn, determinism).
- The resolver `resolveAvatarPhysique` (`EntityFactory`) is the single pure seam;
  any interpreter implementing the rules above matches the official engine
  bit-for-bit.

### Not implemented / planned

The following are target-state descriptions — **none are implemented**; listed to
prevent mis-citation (full spec in the [Avatar Animation Protocol](./avatar-animation.md)):

- **Posture animation set + form/motion separation**: motion as a form-independent,
  retargetable motion set (`avatar.motion`), switched by standard states idle/walk/run/air
  (currently only embedded clips are registered, and the mixer is not advanced). Normative
  basis = VRM 1.0 humanoid skeleton + VRMA motion format.
- **Emote system**: VRM expression presets (happy/angry/sad/relaxed/surprised + visemes)
  via blendshapes with intensity ramps.
- **Standalone avatar metadata file** (`{body, action, emotion, datasource,
  format}`): there is no metadata layer today — an avatar is just "a model
  resource id". If rig retargeting, animation-set declarations, or collision body
  matching are needed later, a dedicated `IDataSource.avatar()` metadata interface
  can be introduced.
- **Collision-body matching**: adjusting the collision capsule to the declared
  physique (height/shoulder width). The VISUAL layer is declaration-driven now
  (§3.1, 2026-07-17); the capsule staying on the world baseline is **deliberate**
  (see §3.1) — if ever opened up it must also go "declaration + world clamp",
  never measured from the model.

The decentralization direction stands: avatars are content-addressed (IPFS CID)
and the loading pipeline already resolves CIDs; chain/IPFS publishing belongs to
P3–P4.
