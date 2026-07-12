# Septopus Adjunct Type Registry

> **Normative.** This document defines the raw data slot semantics of all 19
> built-in adjunct types — the core reference behind the "cross-engine,
> pure-data 3D world" promise: any engine implementing these codecs must
> resolve the same block data into the same world. Architecture & lifecycle:
> [adjunct.md](adjunct.md); trigger logic & the action vocabulary:
> [trigger.md](trigger.md); determinism pins: [determinism.md](determinism.md).
> Reference implementation: `engine/src/plugins/adjunct/*.ts` (each file's
> header comment mirrors this document — drift is a bug).

## 0. Shared conventions

- A **raw row** is a JSON array; a block's `adjuncts` slot carries rows grouped
  as `[typeId, [row, row, …]]` (see [block.md](block.md) §raw).
- **Coordinates/sizes**: always **Septopus axis order** (X east, Y north, Z up,
  metres), relative to the block origin (south-west corner). Engines convert to
  their internal frames on load; the data never carries engine internals.
- **Rotation**: `[rx, ry, rz]` in radians, **engine-frame Euler XYZ about the
  geometric centre** — yaw about the vertical axis lives at **index 1**. This
  asymmetry (positions in the Septopus frame, rotations in the engine frame) is
  deliberate; details in [world.md](world.md) §Coordinate & Rotation Contract.
- **Trailing optional slots** may be omitted entirely; defaults are given per
  table. Implementations must not fail on missing trailing slots.
- **Solid (walk collision)**: `a2` is always solid; standard-7-slot types are
  solid iff slot 6 `stop` is **truthy** — i.e. not `null`/`0`/`false`/empty
  string; `stop=0` is **not** solid (equivalent to `null`). 〔Pinned 2026-07-08:
  the earlier "non-null" wording was ambiguous for `0`; caught by the reference
  engine differential.〕 `b4` is always solid. Other types never
  join walk collision.
- **Derived entities**: entities expanded/spawned at runtime by b6/b9/c2 or the
  actuator `spawn` action are tagged `derivedFrom`, are **never** written back
  into persisted data (only source rows persist), and die with their block.

## 1. Type table

| typeId | Name | One-liner | Slots § |
|---|---|---|---|
| `0x00a1` (161) | wall | standard geometry box (wall semantics) | §2 |
| `0x00a2` (162) | box | standard geometry box, **always solid**, texturable | §2 |
| `0x00a3` (163) | light | point / spot / directional light | §3 |
| `0x00a4` (164) | module | external 3D model (GLTF/GLB/FBX/OBJ/DAE) | §4 |
| `0x00a5` (165) | water | standard box (translucent water, no collision) | §2 |
| `0x00a6` (166) | cone | cone / truncated cone | §2.1 |
| `0x00a7` (167) | ball | sphere (visual; for collision use b4 BALL) | §2 |
| `0x00a8` (168) | sign | unlit textured plane (signage / decals / floating guides) | §2.2 |
| `0x00b4` (180) | stop | invisible collider, **three shapes**: box/cylinder/slope | §5 |
| `0x00b5` (181) | item | pickable item (template + seed deterministic instance) | §6 |
| `0x00b6` (182) | spp | SPP string-particle source, expands to standard adjuncts | §7 |
| `0x00b8` (184) | trigger | events + conditions + actions; slot 6 may declare a teleport anchor | [trigger.md](trigger.md) |
| `0x00b9` (185) | spawner | timed spawner of derived entities | §8 |
| `0x00ba` (186) | npc | autonomous agent (data state machine; can fight/talk) | §9 |
| `0x00c1` (193) | track | Catmull-Rom tube (coaster / rails) | §10 |
| `0x00c2` (194) | motif | template + seed deterministic expansion into adjunct groups | §11 |
| `0x00e1` (225) | link | clickable URL/QR panel | §12 |
| `0x00e2` (226) | audio | spatial audio source | §13 |
| `0x00e3` (227) | video | video screen | §13 |
| `0x00e4` (228) | book | clickable paged-text panel (string[]) | §14 |
| `0x00e5` (229) | board | server-channel message wall (writable shared state) | §14.1 |

## 2. The standard 7 slots (a1 wall · a2 box · a5 water · a6 cone · a7 ball)

```
[ size, pos, rot, resource, repeat, animation, stop ]           // a2: optional slot 7
```

| Slot | Field | Type/default | Notes |
|---|---|---|---|
| 0 | `size` | `[E, N, Alt]`, default `[1,1,1]` | full-length bounding box (m). a7 reads `size[0]` as the diameter |
| 1 | `pos` | `[x, y, z]`, default `[0,0,0]` | geometric centre relative to the block origin |
| 2 | `rot` | `[rx, ry, rz]`, default `[0,0,0]` | engine-frame Euler (see §0) |
| 3 | `resource` | number, default `0` | colour/material index (world resource catalog) |
| 4 | `repeat` | `[u, v]`, default `[1,1]` | texture tiling |
| 5 | `animation` | animation object / `null` | Septopus animation timeline, see [animation.md](animation.md) |
| 6 | `stop` | any/`null` | **truthy ⇒ solid** (`0`/`null`/`false`/empty string = not solid; a2 ignores this slot, always solid) |
| 7 | `texture` | resource id / CID (a2 only, optional) | explicit texture, resolved through the resource pipeline (may be an IPFS CID) |

### 2.1 a6 cone size semantics (special case)

`size = [bottomRadius, height, topRadius]` (not a bounding box). Top radius 0 =
cone, > 0 = truncated cone.

### 2.2 a8 sign (added 2026-07-12)

An UNLIT textured plane — guide arrows, posters, decals, floating waypoint markers: imagery that must read at a glance from any angle at any time of day. Three deliberate contrasts with a textured a2 box: unlit (immune to day/night and shadows), a single plane rather than a closed box (no "through-print" mirroring), and a fitted texture (0..1 UV — reference a texture record WITHOUT `size`, so the shared texture's repeat stays [1,1]). Non-solid; casts no shadow.

```
[ size[E,N], pos[ox,oy,oz], rot[rx,ry,rz], texture, opacity? ]
```

| slot | meaning |
|---|---|
| 0 | plane extent `[east-west, north-south]` (metres; no thickness) |
| 1 | in-block offset |
| 2 | rotation (engine-frame Euler, per §0) |
| 3 | texture resource id |
| 4 | opacity (optional, default 1; `<1` honours the texture's alpha — use 0.95 for transparent-background "floating glyph" signs) |

**Orientation contract**: at rot=[0,0,0] the sign lies FLAT (normal = up) with the texture's V+ (image "up") pointing NORTH — an upright arrow drawn in the image points travel-north in the world. Positive `rx` tilts the top edge toward south (an overhead guide facing a north-bound walker); `rx = π/2` stands it fully vertical facing south.

## 3. a3 light

```
[ lightType, pos, rot, color, intensity, distance, angle, shadow ]
```

| Slot | Field | Default | Notes |
|---|---|---|---|
| 0 | `lightType` | `0` | `0` point · `1` spot · `2` directional |
| 1 | `pos` | `[8,8,8]` | light position |
| 2 | `rot` | `[0,0,0]` | aim direction for spot/directional |
| 3 | `color` | `0xffffff` | integer colour |
| 4 | `intensity` | `1` | intensity |
| 5 | `distance` | `0` | range for point/spot (0 = infinite) |
| 6 | `angle` | `π/3` | spot cone angle (radians); ignored otherwise |
| 7 | `shadow` | `0` | `1` = cast shadows (implementations may degrade for performance) |

## 4. a4 module (external model)

```
[ size, pos, rot, resourceId, animation, stop ]
```

`resourceId` resolves through the world resource catalog to a model file
(GLTF/GLB/FBX/OBJ/DAE). Loading semantics: **placeholder box → async load →
swap**; multiple placements of the same id must **load once, instance many**.
The model is scaled to the authored `size` bounding box (authored size wins
over native model size). Skeletal-clip naming contract:
[avatar-animation.md](avatar-animation.md).

## 5. b4 stop (collider)

```
[ size, pos, rot, mode, animate, shape ]
```

| Slot | Field | Default | Notes |
|---|---|---|---|
| 0–2 | size/pos/rot | — | as in the standard slots |
| 3 | `mode` | `1` | `1` BODY (full block) · `2` FOOT · `3` HEAD (forward-compat; v1 treats all as full volume) |
| 4 | `animate` | `null` | Septopus animation |
| 5 | `shape` | `1` | **`1` box (AABB; rotation does not affect collision) · `2` ball/cylinder (radius = `size[0]/2`, height = `size[2]`, circular footprint) · `3` slope wedge (top face rises from 0 at the south edge to `size[2]` at the north edge; collision honours ONLY the vertical-axis yaw = `rot[1]`)** |

A slope's top face is a **height function** (linear plane); a walking engine
must support continuous walking along it (reference implementation: the
step-over channel riding the surface per sub-step). The reference renders
stops as translucent hint volumes; production content may pair any visual.

## 6. b5 item

```
[ pos, templateId, seed, count, rot? ]
```

Instance attributes derive deterministically from `(templateId, seed)`
(mulberry32; draw order pinned bit-for-bit) — see [item.md](item.md)
(normative). `count` defaults to 1. Pickup semantics: click interaction,
atomic into the bag (inventory change and block-data reserialization complete
in the same frame).

## 7. b6 spp (string particle)

```
[ origin, cells, theme ]
```

`cells` carries the string-particle cell data; `theme` is the expansion theme
(default `'basic'`). On load, the SPP expander **deterministically expands**
the row into independent standard adjunct entities (walls / doorways / windows
/ triggers…); the source row renders nothing. Expansion semantics and
neighbour-elimination rules: the SPP specification.

## 8. b9 spawner

```
[ pos, template, interval, maxAlive, autoStart, seed ]
```

| Slot | Field | Default | Notes |
|---|---|---|---|
| 1 | `template` | `null` | inline `[typeId, rawRow]`; the rawRow position is relative to this spawner |
| 2 | `interval` | `5` | spawn interval (**simulation-time** seconds, never wall clock) |
| 3 | `maxAlive` | `1` | alive cap (slots free when spawns die/despawn) |
| 4 | `autoStart` | `1` | `0` = wait for a trigger action to start |
| 5 | `seed` | `0` | seed source for spawned entities |

## 9. ba npc (agent)

```
[ pos, visual, behavior, seed, hp, dialogue, interact, touch ]
```

| Slot | Field | Notes |
|---|---|---|
| 0 | `pos` | the **HOME anchor**. Runtime roaming mutates runtime state only; persisted data always keeps the anchor |
| 1 | `visual` | `{shape:'box'\|'sphere', size?, color?}` or `{module:<resourceId>, size?}` |
| 2 | `behavior` | behavior document (data state machine), §9.1 |
| 3 | `seed` | wander RNG seed (mulberry32) |
| 4 | `hp` | `>0` = damageable; absent/0 = invulnerable ambience. Runtime hp is never persisted (block reload = full health) |
| 5 | `dialogue` | dialogue tree document, §9.2; non-null = talkable (click opens dialogue first) |
| 6 | `interact` | `{when?, cooldown?(0.4s), actions[]}` — the **player attack verb**: clicking a non-talkable agent runs the actions on cooldown (action vocabulary: trigger.md; `damage target:'self'` = "the hit lands on me") |
| 7 | `touch` | `{damage, interval?(1s), radius?(1.2m)}` — **contact damage following the live body** (lands in Game mode only) |

### 9.1 The behavior document

```jsonc
{ "initial": "idle",
  "states": {
    "<state>": {
      "move": { "kind": "stay"|"wander"|"follow"|"flee"|"return", "speed"?, "radius"?, "stopAt"? },   // speed default 1 m/s (normative)
      "transitions": [{ "when": <JSONLogic>, "to": "<state>" }],   // first truthy wins
      "enter": [ <action>… ]                                       // once per state entry
    } },
  "onDeath": [ <action>… ] }                                       // on hp reaching zero (loot = spawn)
```

JSONLogic context: `npc.{distToPlayer, distFromHome, state, timeInState}`,
`flags.*`, `inventory.*`, `time`, `weather`. **The wander-target formula is a
determinism pin** (exactly 2 rng draws per target; uniform over the disk around
home) — see [determinism.md](determinism.md).

### 9.2 The dialogue document

```jsonc
{ "start": "<node>",
  "nodes": { "<node>": {
      "text": "…",
      "options": [{ "label": "…", "when"?: <JSONLogic>, "actions"?: [<action>…], "to"?: "<node>" }]
  } } }
```

Clicking a talkable agent (distance ≤ 3.5 m) opens it; one conversation at a
time world-wide; the agent holds still while talking; `when` filters visible
options; a missing/invalid `to` ends the conversation. Quests deliberately add
**no new primitive**: a quest is the recipe "flag writes + options whose `when`
reads flags/inventory".

## 10. c1 track

```
[ pos, path, radius ]
```

`path` is a control-point list `[[E,N,Alt], …]` (relative to `pos`), extruded
as a Catmull-Rom tube. Ride-session semantics (entry is Game-gated) are
implementation-defined; the geometry is normative.

## 11. c2 motif (generative content)

```
[ origin, template, seed, params ]
```

Looks up `template` in the generator catalog and **deterministically expands**
with `seed` (mulberry32) + `params` into standard adjunct rows (currently all
solid a2 boxes). The source row is the only persisted artifact; expanded rows
are derived entities and **exempt from the block row budget**. The same
`(template, seed, params)` must expand into byte-identical rows (the iNFT
property) — see [determinism.md](determinism.md). Optional `params.texture`
(content CID) feeds image-board-style templates.

## 12. e1 link panel

```
[ size, pos, rot, resource, repeat, animation, stop, url, texture? ]
```

The standard 7 slots + slot 7 `url` (string) + optional slot 8 `texture`
(QR/image resource id or CID). Click (primary interaction ray) → the host opens
`url` (desktop reference: `window.open`; hosts may add a confirmation UI).

## 13. e2 audio / e3 video

```
e2: [ size, pos, rot, source, autoplay, loop, volume, refDistance ]
e3: [ size, pos, rot, source, autoplay, loop, muted, volume ]
```

`source` resolves through the resource pipeline (id/CID/URL). e2 is positional
audio (`refDistance` defaults to 8 m; the falloff model is implementation
choice but must attenuate with distance); e3 is a video texture on a panel
(default `muted=1` — browser autoplay policy). Media must be fully released
when the entity is destroyed.

## 14. e4 book (paged text)

```
[ size, pos, rot, resource, repeat, animation, stop, pages, title? ]
```

The 4th member of the e-series media-panel family (e1 link · e2 audio · e3 video
· **e4 book**): a panel + a resource + a click behaviour. Clicking it (primary
interaction ray) → the host opens a **paged reader** (prev / next / page N/M /
close). It is the inanimate sibling of the ba NPC's dialogue tree — same "台词"
text, but a book is a **linear reader on an object** whereas dialogue is a
**branching conversation on a character**; neither replaces the other.

| Slot | Field | Default | Notes |
|---|---|---|---|
| 0–2 | size/pos/rot | — | standard slots (default upright tome `[0.7,0.2,0.9]`) |
| 3 | `resource` | `0` | cover colour/material index; a textured cover tints white to show true |
| 4 | `repeat` | `[1,1]` | texture tiling |
| 5 | `animation` | `null` | Septopus animation |
| 6 | `stop` | `null` | non-null ⇒ solid |
| 7 | `pages` | `[]` | **the pages**: an inline `string[]` (dev plaintext) **or** a resource id / **IPFS CID** that resolves to a `string[]` (production; large text stays off-block, same as e2/e3 `source`). An empty book is inert (not an error) |
| 8 | `title` | `''` | text shown in the reader chrome |

Paging is a **pure view action** (the page index is client state, same discipline
that keeps e1's `window.open` in the client); the engine only renders the tome +
carries the text and emits the generic `interact.primary` on click. The page
index is clamped to `[0, M-1]` (no wrap).

**Example row** (a three-page book, `e4`, inline plaintext):

```jsonc
[[0.7,0.2,0.9], [11,8,1.2], [0,0,0], 0, [1,1], null, null,
 ["Page one: click the book to turn pages.",
  "Page two: text is carried as string[]; it may live on IPFS.",
  "(Close the book.)"],
 "An Untitled Book"]
```

### 14.1 e5 board (added 2026-07-08)

```
[ size, pos, rot, resource, repeat, animation, stop, channel, title? ]
```

The standard 7 slots + slot 7 `channel` (string, default `'lobby'`) + optional
slot 8 `title`. The 5th member of the e-series panel family; the key contrast
with e4 book: **a book's content rides in the data (immutable), a board's
content is mutable shared state on a server** — the data declares only the
channel id; reading/writing is a host concern via a board service (offline
degrades to read-only), the same shape as Game mode ("the block declares
intent, the host dials the service", [game.md](game.md) §2/§9: session state
stays off-chain). Blocks may share a channel. Clicks ride `interact.primary`;
presentation (the panel UI) is host-level, non-normative.

## 15. Dynamic type segment (normative, 2026-07-08)

- **The built-in segment `0x0000–0xefff` is reserved for this protocol**:
  built-in semantics are defined here and implemented natively by each engine —
  they can **not** be declared or overridden by data (dynamic modules); allowing
  that would allow redefining "wall" or squatting future built-in slots.
- **The dynamic segment `0xf000–0xffff`**: custom types registered via a
  `septopus.adjunct.module` document (envelope & loading: [envelope.md](envelope.md))
  **must** fall in this segment; out-of-segment registration must be rejected.
  Two modules claiming the same typeId within one world = a load error (fail fast).
- The cross-engine truth of a dynamic type is the module's **descriptor** (the
  pre-evaluated declarative product); `code` is an optional generator path
  (engines with a sandbox may run it and must verify the result matches the
  descriptor).

---

*Protocol v0.1 (engine v0.1.0; §15 added 2026-07-08). Changes must land in both
cn/en and be recorded in the root CHANGELOG.*
