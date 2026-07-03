# Modes & Avatar — design + near-term implementation spec

Status: **largely implemented** (avatar: 51cfb17; trigger mode gating: cb2473d,
2026-06). Scope was: finish the 4-mode system (Normal / Edit / Game / Ghost) and
implement the player **avatar** as an IPFS-fetchable model resource reusing the
existing model pipeline. A **5th mode, Observe, was added post-spec** (2026-06,
outside this document's original scope) — see the note under the target table.

**Outcome vs. plan** — one semantic delta remains; the gaps closed 2026-06-12:
1. Trigger gating shipped with REFINED semantics: triggers evaluate in Normal AND
   Game (Edit/Ghost fully disabled); the volume-level `gameOnly` flag (raw default
   = 1) restricts a volume to Game. Net default behavior matches the target table
   (fire only in Game), but authors can opt volumes into Normal with `gameOnly: 0`
   — the demo court does. Contract: `protocol/cn/trigger.md`.
2. ✅ `Engine.setMode()` + `SystemMode` export + `DesktopLoader.setMode` + the
   4-button client mode switcher (App.tsx) shipped.
3. ✅ Ghost shipped: avatar hidden, noclip free-roam (no gravity/collision,
   Space ascends / Shift descends), fall events skipped. D3 resolved as "now".

Related: `docs/plan/STANDALONE_ENGINE_ROADMAP.md` (closeout), the module/texture
work (`ResourceManager`, `ModelLoader`), `engine/src/core/types/SystemMode.ts`.

---

## Part A — The 4 modes (+ Observe, added post-spec)

### Current state (audited — HISTORICAL, pre-cb2473d; kept for context)

> The bullets below describe the codebase BEFORE the trigger work landed.
> Superseded: `TriggerSystem` now gates on `world.mode` (Edit/Ghost disabled,
> `gameOnly` → Game-only), so "never checks world.mode" and "Ghost: zero
> consumers" no longer hold. Still true: no `Engine.setMode()`, no client
> mode switcher.

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
| **Observe** | visible | — (player frozen) | no | frozen; camera orbits a target | inspect/spectate a fixed subject (5th mode, post-spec) |

The only behavioral deltas are small and surgical: triggers fire **only in Game**,
the avatar is hidden **only in Ghost**, editing happens **only in Edit** (already
done). Default boot mode stays **Normal** (least disruptive; lots of code reads
`!== Edit`).

> **Observe (5th mode, added 2026-06 after this spec)**: freezes the player —
> `CharacterController` early-returns before movement (`CharacterController.ts:106-110`);
> the camera orbits the observe target in spherical coordinates: drag to rotate,
> W/S to zoom, always facing the target (`CameraRig.processObserve`,
> `CameraRig.ts:193-215`); the avatar stays **visible** (`CameraRig.ts:217-219`);
> the durable position is never written (saveMeta `'player'` is Normal/Game-only);
> freely switchable, no entry guard.
>
> **Edit movement (clarification)**: `CharacterController` has NO Edit-specific
> branch — movement is walk + collide, identical to Normal (no freeze). The only
> side effect is that camera rotation is disabled while dragging an object
> (`CameraRig` `canRotate`). Like Ghost/Observe, Edit never writes the durable
> position (`player.state` events still emit in every mode).

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
   gravity + solid collision (noclip) and allow vertical fly (shipped as
   Space up / Shift down). Keep out of P1
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
- [x] `TriggerSystem.update`: mode gating (cb2473d) — shipped as Edit/Ghost
      disabled + `gameOnly` (default 1) → Game-only, NOT a blanket Game-only gate;
      `entitiesInside` is NOT cleared on mode exit (state carries over, which
      prevents stale `in` re-fires — D4 resolved the other way).
- [x] `CharacterController.syncCameraAndAvatar`: avatar hidden in Ghost; ghost
      branch = noclip fly (no gravity/collision, Space up / Shift down).
- [x] `Engine.setMode(mode)` + `SystemMode` exported from Engine.ts.
- [x] `DesktopLoader.setMode` + `useEngine.mode` + App.tsx 4-mode switcher
      (replaced the lone edit toggle; `isEditMode` derived for compat).
- [x] Tests: trigger mode gating (`trigger-pipeline.test.ts`, e2e
      `trigger.spec.ts`); Ghost fly/hide + setMode reachability
      (`engine-features.test.ts`, e2e `engine-features.spec.ts`).

Avatar (all landed in 51cfb17):
- [x] `AvatarComponent.resource?: string`; `WorldConfig.player.avatar`
      (only `.resource` is consumed; `.scale`/`.max` reserved, unread).
- [x] Avatar load+swap: `EntityFactory.loadAvatarModel` (helper, no separate
      AvatarSystem) — getModel/instance + uniform scale-to-height + placeholder
      swap; embedded clips auto-play (first clip) via `RenderEngine.startAnimation`.
- [x] `DesktopLoader`: demo avatar record id 30 → `/assets/avatar.glb` (rigged).
- [x] Tests: e2e `avatar.spec.ts` + resource-manager unit tests (load-once/dedup).
      Ghost-hides-it untested (feature missing).

Docs:
- [x] Roadmap updated; protocol docs synced to implementation 2026-06-11
      (`protocol/{cn,en}/player.md`, `docs/systems/player.md` — avatar §3 rewritten,
      reserved fields and unimplemented items marked).

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
