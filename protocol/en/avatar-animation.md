# Septopus Avatar Animation Protocol

> Status: **base pipeline implemented** (embedded clips decode → register on a mixer →
> advanced each frame, so they **do play**); **form/motion separation, the standard
> skeleton contract, retargeting, and VRM/VRMA are not implemented** (see §7). This protocol defines
> the data contract for *how an avatar moves*, so that **any interpreter** (the current
> TypeScript 3D engine is just one official interpreter) reaching the same data produces
> the same animation. Companion to [Player Protocol §3](./player.md); implementation in
> `engine/src/core/EntityFactory.ts`, `engine/src/render/RenderEngine.ts`,
> `engine/src/core/movement/CharacterController.ts`.

## 0. Core principle: form / motion / state are three separable layers

An animated avatar is composed of **three independently swappable layers**, referenced and
distributed separately, so motion is **reusable across forms** and a form can be
**re-skinned without touching its motion**:

| Layer | Meaning | Normative basis | Data reference |
|---|---|---|---|
| **form** | mesh + skin + standard humanoid skeleton | glTF / VRM (bones per §1) | `avatar.resource` (id / IPFS CID) |
| **motion** | form-independent humanoid clip library, keyed by state | VRMA / glTF clips (per §3) | `avatar.motion` (motion-set id / CID) |
| **state** | engine-driven semantic state machine | **defined in §2** | not in data — derived deterministically by the engine |

> "Separable + reusable" is only possible because the **skeleton is standardized** (§1):
> motion and form share one bone-naming convention, so the engine can **retarget** any
> motion onto any form. Same principle as VRM/VRMA, Mixamo, Ready Player Me, Unity Humanoid.

## 1. Normative skeleton — VRM 1.0 Humanoid

The avatar skeleton **normatively adopts the VRM 1.0 humanoid bone definitions**. A
conforming avatar satisfies one of:

- is itself a **`.vrm`** (humanoid bones built in); or
- is **glTF / FBX** whose bones **map** to VRM humanoid bone names (Mixamo's
  `mixamorig:*` has a defined mapping — appendix A).

### Required core bones (missing any → non-conforming)

```
hips
spine            head
leftUpperArm  leftLowerArm  leftHand
rightUpperArm rightLowerArm rightHand
leftUpperLeg  leftLowerLeg  leftFoot
rightUpperLeg rightLowerLeg rightFoot
```

Optional bones (`chest` / `upperChest` / `neck` / fingers / eyes) follow the full VRM
spec (~54); missing ones are simply skipped during retarget.

### Facing normalization

The avatar's **forward = engine −Z (north)**. The importer normalizes the model's rest
pose (T/A-pose) facing to that axis (VRM 1.0 rests facing +Z → rotate 180° about Y; other
formats normalized from their own default facing). Axis mapping follows the
[coordinate protocol](../../docs/architecture/coordinate.md).

## 2. Normative state set

The engine **deterministically derives** a semantic state from player motion, then drives
the motion layer. The state set and transition rules are part of the protocol (so all
interpreters agree):

| State | Meaning | Loop | Derivation (normative) |
|---|---|---|---|
| `idle` | standing | loop | `isGrounded` and `hSpeed ≤ IDLE_MAX` (default 0.5 m/s) |
| `walk` | walking | loop | `isGrounded` and `IDLE_MAX < hSpeed ≤ WALK_MAX` (default `maxSpeedWalk·1.2`) |
| `run`  | running | loop | `isGrounded` and `hSpeed > WALK_MAX` |
| `air`  | airborne (rise/fall) | loop | sustained `!isGrounded` beyond **AIR_COYOTE** (default 0.12s) — see the hysteresis note below |
| `jump` | takeoff (optional) | once | the frame the jump impulse is applied; falls back to `air` |
| `land` | landing (optional) | once | the frame `air`→`isGrounded`; falls back to `idle/walk/run` |

- `hSpeed` = horizontal speed magnitude (vertical ignored). Thresholds are tunable via
  `PlayerBodyComponent`, but **the semantics and comparison relations are fixed**.
- **`air` must be debounced (normative, coyote time)**: in many character-controller
  implementations `isGrounded` **flickers every frame on flat ground** (gravity is skipped
  while grounded → no downward probe → not re-detected → false → gravity → re-lands → true,
  flipping each frame). Feeding raw `isGrounded` into the state machine makes `walk/idle`
  and `air` **thrash every frame**, and each switch `reset()`s the looping clip to frame 0 —
  the character appears **frozen in its starting pose** (a real, fixed bug — 2026-07-04).
  So `air` **must be debounced**: only a sustained airborne streak exceeding `AIR_COYOTE`
  counts as real `air`; a genuine jump/fall far exceeds the window, and a one-frame landing
  flicker is absorbed. Reference: `CameraRig` accumulates `_airborneSec`, cleared on landing.
- **v1 core**: `idle/walk/run/air` (matches current `CharacterController`); `jump/land`
  are optional enhancements.
- **Fallback chain** (when the motion set lacks a state's clip): `run→walk→idle`,
  `air→jump→idle`, `land→idle`. Every state ultimately falls back to `idle`, so a motion
  set **must contain `idle`**.
- Default transition **crossfade 0.25s** (`RenderEngine.setAnimationState` `fadeSec`).

## 3. Motion set & retargeting

A **motion set** = a form-independent collection of humanoid clips **keyed by §2 state name**.

- **Formats** (priority): 1. **VRMA** (`VRMC_vrm_animation`, open humanoid animation
  format, **recommended**); 2. **glTF/GLB** with `AnimationClip`s named by state;
  3. **Mixamo FBX** (animation-only export, bones mapped per appendix A).
- **Clip-naming contract**: clip names **must** equal state names (case-insensitive), or
  declare an alias map in motion-set metadata.
- **Retargeting**: since form and motion share the VRM humanoid skeleton, the engine
  retargets motion channels onto the form's skeleton by bone name at load (missing bones
  skipped). Retargeting is an engine concern — **not in the data**.

## 4. Data reference — form and motion referenced separately

`world config`'s `player.avatar` extends to:

```json
"player": {
  "avatar": {
    "resource": 30,        // form: model resource id / IPFS CID (required)
    "motion": 31,          // motion set id / IPFS CID (optional; omit = engine default)
    "scale": [1, 1, 1],    // body scale (reserved)
    "max": 2097152         // size cap (reserved)
  }
}
```

| Field | Meaning | Status |
|---|---|---|
| `resource` | **form** model resource id (via `IDataSource.module()`) | ✅ consumed |
| `motion` | **motion set** id (independent of form; omit → engine's built-in default set) | 🚧 specified, not consumed |
| `scale` / `max` | body scale / size cap | 🚧 reserved |

- **Why separate**: any interpreter resolving the same `(resource, motion)` pair produces
  the same animation — form and motion are each content-addressed (CID), cached and reused
  independently. Swap the form without touching motion, and vice versa.
- **Default motion set**: the engine must ship a conforming default humanoid motion set so
  **any conforming form animates even without an explicit `motion`**.

## 5. Expression — planned

VRM defines a standardized expression system (presets `happy/angry/sad/relaxed/surprised`
+ visemes `aa/ih/ou/ee/oh` + `blink/lookAt`). Avatar expressions **normatively reuse VRM
expression presets**, landed via render-layer morph/blendshape (reusing the Septopus animation `morph`
channel through `RenderEngine.setMorphInfluences`). **Not implemented in v1**; named only
to reserve the namespace.

## 6. Relationship to Septopus animation (do not conflate)

This protocol is **humanoid skeletal/locomotion** animation. It is a **separate mechanism**
from [Septopus timeline animation](../../docs/systems/animation.md) (the adjunct/block
declarative `timeline`: move/rotate/scale/opacity/color/texture/morph): the former drives
**rigged characters**, the latter drives **adjunct transforms**. Both land via the render
layer; neither replaces the other.

## 7. Implementation status

| Step | Status |
|---|---|
| form: load / scale-to-height / placeholder swap / hide in first-person | ✅ |
| embedded clips decoded + registered on a mixer (rigged `avatar.glb`; e2e `avatar.spec.ts` asserts clipCount/mixerCount > 0) | ✅ |
| state derivation + `setAnimationState` crossfade + **per-frame mixer advance** (`RenderEngine.updateAnimation`, `core/movement/CameraRig.ts:180-188` — `CharacterController` delegates avatar pose/animation to `CameraRig`) | ✅ **embedded clips do play** |
| state → clip mapping | ✅ **v1 landed**: normative contract first (§3 case-insensitive name equality) + §2 fallback chains (`run→walk→idle`, `air→jump→idle`, `land→idle`) + §2 threshold derivation (`IDLE_MAX 0.5` / `WALK_MAX = maxSpeedWalk×1.2` linear, `CameraRig`); the old regex heuristics remain only as a **degrade for non-compliant assets** (`ANIM_STATE_PATTERNS`) |
| facing normalization (per-model) | ✅ **v1.1 (2026-07-04)**: `AvatarComponent.facing` (yaw radians) corrects each GLTF's forward mismatch; `CameraRig` applies `playerYaw + facing`. Verified on 3 assets: soldier −Z (0), legacy + robot +Z (π) — **no universal value; each model carries its own**. Still TODO: skeleton bone-name validation / humanoid normalization |
| **form/motion separation** (`avatar.motion` shared retargetable library) / retargeting / built-in default set | ❌ **clips must be embedded in each avatar GLB; no Mixamo-style cross-model reuse** |
| native VRM / VRMA loading (`@pixiv/three-vrm`) | ❌ (`ModelLoader` has no .vrm support) |
| expression system | ❌ |

> In one line: it **moves** (embedded clips play), but **motion is welded into the form,
> state switching guesses by clip name, and there is no standard skeleton or reusable motion
> library** — this protocol normalizes that.

### 7.1 Per-model correction parameters

Importing an external GLTF/GLB avatar is not normalized by "scale-to-height"
alone — models **disagree on which way is forward** (+Z vs −Z), so applying the
player yaw directly can render the character back-to-front. Each avatar therefore
carries a small set of correction parameters that align it to the Septopus frame:

| Parameter | Meaning | Source |
|---|---|---|
| **facing** | yaw correction (radians): `CameraRig` applies `playerYaw + facing`, aligning the model's forward to Septopus north (−Z) | authored per model (client avatar catalog) |
| **height→scale** | uniform scale so the bbox height = body height (1.8 m) | automatic (derived from `bounds` at load) |
| **footOffset** | scaled bbox bottom relative to the origin; planting at `feetY − footOffset` puts the feet on the ground regardless of the pivot | automatic |

**Empirical facing values (v1.1, 3 demo assets):**

| Avatar | facing | forward convention |
|---|---|---|
| legacy `avatar.glb` (Wanderer) | `π` | +Z |
| `soldier.glb` (three.js Mixamo) | `0` | −Z |
| `RobotExpressive.glb` | `π` | +Z |

**There is no universal value** — the soldier is opposite to the other two, so
`facing` must be calibrated per model. A compliant avatar (§1 standard skeleton)
will eventually drop the manual `facing` (its skeleton is already oriented); this
parameter carries non-compliant assets in the meantime.

### Phasing

- **v1 (normalize the state contract)**: **landed (2026-07)** — §2 state set + threshold
  derivation + §3 clip naming (name equality first) + fallback chains are in the engine; the
  old regex heuristics degrade-only for non-compliant assets. Orientation is handled per
  model by the §7.1 `facing` parameter (v1.1); **skeleton bone-name validation /
  humanoid normalization** still goes with v2 retargeting. Motion still from
  embedded clips, no cross-model retarget yet.
- **v2 (form/motion separation)**: consume `avatar.motion`; implement humanoid retargeting +
  a built-in default motion set; normalize glTF/FBX bone names to VRM humanoid (appendix A).
  **This step is where "motion separate from form" actually lands.**
- **v3 (native VRM)**: add `@pixiv/three-vrm` / `@pixiv/three-vrm-animation`, load `.vrm` /
  `.vrma` natively; expression presets.

---

## Appendix A — Mixamo → VRM humanoid bone map (excerpt)

| Mixamo (`mixamorig:`) | VRM humanoid |
|---|---|
| `Hips` | `hips` |
| `Spine` / `Spine1` / `Spine2` | `spine` / `chest` / `upperChest` |
| `Neck` / `Head` | `neck` / `head` |
| `LeftArm` / `LeftForeArm` / `LeftHand` | `leftUpperArm` / `leftLowerArm` / `leftHand` |
| `RightArm` / `RightForeArm` / `RightHand` | `rightUpperArm` / `rightLowerArm` / `rightHand` |
| `LeftUpLeg` / `LeftLeg` / `LeftFoot` | `leftUpperLeg` / `leftLowerLeg` / `leftFoot` |
| `RightUpLeg` / `RightLeg` / `RightFoot` | `rightUpperLeg` / `rightLowerLeg` / `rightFoot` |

> The full humanoid bone set and optional bones follow the VRM 1.0 spec.
