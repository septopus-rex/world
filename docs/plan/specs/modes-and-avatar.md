# Modes & Avatar — design + near-term implementation spec

Status: **spec / near-term work plan**. Scope: finish the 4-mode system
(Normal / Edit / Game / Ghost) and implement the player **avatar** as an
IPFS-fetchable model resource that reuses the existing model pipeline.

Related: `docs/plan/STANDALONE_ENGINE_ROADMAP.md` (closeout), the module/texture
work (`ResourceManager`, `ModelLoader`), `engine/src/core/types/SystemMode.ts`.

---

## Part A — The 4 modes

### Current state (audited)

- `SystemMode` enum has all four values: `Normal · Edit · Game · Ghost`
  (`core/types/SystemMode.ts`).
- Switch scaffold exists: `World.mode`, `World.setMode()`, `world:mode_changed`
  event, exit-Edit → `world:save_request`, enter-Game → `world:preload_request`
  (`core/World.ts:99,224`).
- **Edit ↔ Normal**: fully wired. `EditSystem`, `RaycastInteractionSystem`,
  `AnimationSystem`, `CharacterController` all gate on `world.mode === Edit`.
  Client has an ENTER/EXIT EDIT toggle.
- **Game**: stub. `setMode(Game)` only emits a preload event; **no system gates
  behavior on Game** — notably `TriggerSystem` never checks `world.mode`, so
  triggers fire in every mode.
- **Ghost**: enum-only. Zero consumers, no entry point. (Note: `MockWorldGhostMoon`
  is a *world*, not this player mode — do not confuse.)
- Public API exposes only `Engine.setEditMode(active)` (Edit↔Normal). No
  `Engine.setMode()`, so Game/Ghost are unreachable from the client.

### Target semantics

| Mode | Avatar | Triggers fire | Edit | Movement | Intent |
|------|--------|---------------|------|----------|--------|
| **Normal** | visible | no | no | walk + collide | default explore of your own world |
| **Game**   | visible | **YES** | no | walk + collide | play — interactive logic active |
| **Ghost**  | hidden  | no | no | free roam (noclip/fly, P2) | 瞎逛 / spectate, incorporeal |
| **Edit**   | visible | no | **YES** | walk + collide | build/place adjuncts |

The only behavioral deltas are small and surgical: triggers fire **only in Game**,
the avatar is hidden **only in Ghost**, editing happens **only in Edit** (already
done). Default boot mode stays **Normal** (least disruptive; lots of code reads
`!== Edit`).

### Implementation (gating points)

1. **Triggers → Game only.** `TriggerSystem.update`: early-return unless
   `world.mode === SystemMode.Game`. (Decide: should entered-volume tracking still
   run so re-entering Game doesn't re-fire stale `in` events? Simplest P1: skip the
   whole system off-Game and clear `entitiesInside` on mode change.)
2. **Avatar visibility → hide in Ghost.** In
   `CharacterController.syncCameraAndAvatar` (runs each frame) set
   `renderEngine.setObjectVisible(avatarHandle, world.mode !== SystemMode.Ghost)`.
3. **Edit** — already gated; no change.
4. **Public API.** Add `Engine.setMode(mode: SystemMode)` (delegates to
   `world.setMode`); keep `setEditMode` as sugar. Export `SystemMode` from the
   engine entry so the client can pass it.
5. **Client UX.** Replace the single edit toggle with a small mode switcher
   (Normal / Game / Ghost / Edit) in `App.tsx` + `useEngine`. `DesktopLoader`
   gains `setMode(mode)` forwarding to `engine.setMode`.
6. **Ghost free-roam (P2, optional).** `CharacterController`: in Ghost, skip
   gravity + solid collision (noclip) and allow vertical fly (R/F). Keep out of P1
   if it risks the movement stability already achieved.

### Open decisions (flag in review)

- **D1** Ghost avatar: hidden (recommended) vs translucent.
- **D2** Default boot mode: Normal (recommended) vs Ghost.
- **D3** Ghost noclip/fly: P1 or P2 (recommended P2).
- **D4** Trigger re-fire on re-entering Game (clear `entitiesInside` on mode exit).

---

## Part B — Avatar as an IPFS-fetchable model resource

### Current state

- **Old engine: never implemented.** Only spec/placeholder — `body`/`avatar`
  config blocks in `mock.js`/`world.md`, an `avatar` resource *type* in
  `resource.md`, a `//avatar` placeholder box + `texture/avatar.jpg` in
  `design.js`, and a v1.1.0 release note that overstated it. No avatar mesh is
  created anywhere in the old `player.js`/render code.
- **New engine: a working placeholder.** `EntityFactory.setupPlayer` →
  `RenderEngine.createAvatarMesh()` (a translucent blue 0.6×1.8×0.6 box) +
  `AvatarComponent`, synced each frame by `CharacterController.syncCameraAndAvatar`.
  Real, but a primitive box.

### The key insight: avatar IS a model resource

An avatar is *a 3D model fetched by id and deployable on IPFS* — exactly what the
module-model pipeline already does. **Do not build a parallel asset path.** Reuse:

- `ResourceManager.getModel(resourceId)` — load-once-by-id, Promise-deduped.
- `resolveUrl()` — already maps an **IPFS CID → gateway URL** (and path/data/http).
- `ResourceManager.instance()` — clone per use (SkeletonUtils for rigged → ready
  for animated avatars), shared geometry/material, ref-counted.
- placeholder-then-swap — show the blue box instantly, swap in the loaded avatar
  when it resolves (mirror `AdjunctFactory.scheduleModuleSwap`).

So an avatar stored on IPFS "just works" through the pipeline built for modules.

### Architecture

```
WorldConfig.player.avatar = { resource: <id> }      // model resource id (e.g. IPFS CID-backed)
        │
EntityFactory.setupPlayer:
  1. create placeholder avatar mesh (existing createAvatarMesh)  // instant
  2. AvatarComponent { handle, resource }
  3. if resource: schedule avatar swap (new AvatarSystem or helper):
        world.resourceManager.getModel(resource)                 // load once (IPFS CID via resolveUrl)
          .then(entry => {
             const model = world.resourceManager.instance(resource)   // clone (rigged-aware)
             scaleToBody(model, entry.bounds, PlayerBodyComponent)     // fit to height/width
             swap: replace placeholder with model in the avatar handle
             AvatarComponent.handle = model
          })
        │
CharacterController.syncCameraAndAvatar  // positions/rotates the avatar handle each frame, hides in Ghost
```

### Data source

- Reuse `IDataSource.module(ids)` for now — an avatar is a model record
  `{ type:'avatar', format:'glb', raw:<CID|path> }`; `ResourceManager.getModel`
  is format/`type`-agnostic. (Optionally add a dedicated `IDataSource.avatar(ids)`
  later if avatars need distinct metadata — rig, animation set, capsule size.)
- `DesktopLoader`: serve a demo avatar record (a glb in `public/assets/`) and set
  `WorldConfig.player.avatar.resource`. Same wiring as the demo models.

### Scale-to-body

Like module scale-to-fit, but to the player capsule: scale the avatar model so its
bounds match `PlayerBodyComponent.height` (uniform, preserve aspect — do **not**
stretch). Feet at the entity origin (the placeholder box already centers feet at
origin: `mesh.position.set(0, height/2, 0)`).

### Dedup / future multiplayer

`getModel` already dedups by id and ref-counts. When multiple players share an
avatar id (future networked play), the file loads **once** and each player gets a
clone — the load-once/instance-many contract carries over for free. Release on
player despawn via `resourceManager.release`.

### Phasing

- **P1 (near-term)**: load + display + scale + position a static avatar model from
  a resource id (IPFS-capable via `resolveUrl`), placeholder→swap, hide in Ghost.
- **P2**: rigged avatars — `SkeletonUtils.clone` path already exists; drive an
  `AnimationMixer` from movement state (idle/walk/run/jump). Ties into the deferred
  module-animation work.
- **P3**: per-player avatars over the network; avatar resource catalog / IPFS
  "wardrobe"; capsule/collision derived from the avatar's body spec.

---

## Part C — Near-term checklist ("处理干净")

Modes:
- [ ] `TriggerSystem.update`: gate firing on `world.mode === Game` (+ clear
      `entitiesInside` on mode exit).
- [ ] `CharacterController.syncCameraAndAvatar`: hide avatar in Ghost.
- [ ] `Engine.setMode(mode)` + export `SystemMode` from the engine entry.
- [ ] `DesktopLoader.setMode` + `App.tsx`/`useEngine` mode switcher (Normal/Game/
      Ghost/Edit) replacing the lone edit toggle.
- [ ] Tests: triggers fire only in Game; avatar hidden in Ghost; setMode reaches
      the world (headless, NullRenderEngine).

Avatar:
- [ ] `AvatarComponent.resource?: string`; `WorldConfig.player.avatar`.
- [ ] Avatar load+swap helper (mirror `scheduleModuleSwap`) using
      `world.resourceManager.getModel/instance` + scale-to-body; new `AvatarSystem`
      or a method invoked from `setupPlayer`.
- [ ] `DesktopLoader`: serve a demo avatar record + set the player avatar resource;
      add a small `.glb` to `public/assets/`.
- [ ] Tests: avatar resource loads once, swaps the placeholder, scales to body;
      Ghost hides it; dedup if two players share an id.

Docs:
- [ ] Update `STANDALONE_ENGINE_ROADMAP.md`: modes complete, avatar implemented,
      old-engine avatar was spec-only.

---

## Part D — Long-term vision

- **IPFS avatar wardrobe**: avatars are content addressed (CID); a player picks an
  avatar id, the engine fetches+caches it via `ResourceManager` exactly like any
  model. No engine change needed beyond a resource id + the swap.
- **Rigged + animated**: the rigged clone path (`SkeletonUtils`) is already in
  place; P2 drives mixers from movement verbs.
- **Unifies with modules**: avatar, module adjunct, and (future) NPC models are all
  the same "model resource by id" primitive — one loader, one cache, one dedup,
  one CID-resolution path. The mode system decides *when/whether* the avatar is
  shown; the resource system decides *what* it is.
