# Septopus World Protocol

Within the **Septopus Engine**, a "World" (`world`) is the highest-level administrative and physical bounding box. A Septopus World consists of a continuous grid of Blocks, and is governed by global physics, atmospheric conditions, and access rules enforced by the engine. Content organization within these blocks (e.g., via the SPP protocol) is a specific implementation layer within this management framework.

## 1. World Architecture & Layout

The Septopus metaverse is composed of a fixed number of overarching Worlds.
*   **Total Worlds**: 96 individual Worlds. **This is a metaverse-level constant** (a property of the cosmic cube, not of any single world) and does not appear in a world document.
*   **Macro Structure**: The 96 worlds are mathematically mapped onto the 6 faces of a massive cosmic cube (4x4 worlds per face).

**World geometry (`range` / `block` / `diff`) is per-world configuration DATA (normative, revised 2026-07-27)** — declared by the **world document**, not an engine constant:

| Field | Meaning | Protocol default (when the document omits it) |
|---|---|---|
| `world.range` | Block count per axis `[East, North]`; blocks are numbered from `[1,1]` | `[4096, 4096]` |
| `world.block` | One block's size in metres, Septopus axis order `[East, North, Alt]` | `[16, 16, 16]` |
| `world.diff` | Height granularity in metres | `0.1` |

**An engine implementation MUST read these three from the world document and MUST NOT hardcode them.** The reference world (Genesis) declares exactly the defaults above — so "a 4096×4096 grid of 16 m blocks" remains the shape of virtually every world in practice; but that is the **value of the data**, not a constraint of the **mechanism**.

> **Why this changed (superseding the 2026-07-09 base-data-audit D6 ruling of "protocol invariant, not overridable per world")**: on-chain world configuration management has to be able to define a world's grid, and pinning these three numbers inside the engine leaves that permanently incomplete. Moving them from constants into the document also removed a real defect in the reference implementation — block size had been stored in a **process-global mutable static**, so concurrent worlds (tests, block preview, stylepack editor) overwrote each other's geometry and whichever constructed last won.
>
> **Validity bounds (not semantics — a defence against corrupt/hostile documents)**: `range` is an integer in `1..1048576` per axis; `block` is `0.01..1024` metres per axis; `diff` is positive and no greater than the block height. An implementation MUST fall back to the defaults above and REPORT when a value falls outside — never accept it silently.

*   **Each horizontal axis is computed independently**: the East/North components of `range` and `block` are independent, so neither the world grid nor a block need be square. Multiplying both axes by a single extent is a bug (the reference implementation once did exactly this).

## 2. Administration & The "Lord" (领主)

Each World is a distinct sovereign territory owned by a "Lord." The Lord holds an administrative NFT or cryptographic key that grants permission to modify the World's global parameters on the blockchain.

**Lord Capabilities:**
*   **Monetization & Taxes**: The Lord can set economic policies or sell/transfer the Lordship to another entity.
*   **Aesthetic Overrides**: The Lord can change the default terrain textures, default ground color, and base elevation of the unowned wilderness blocks.
*   **Access Control**: The Lord decides which operation modes are permitted (e.g., banning "Ghost" spectators or enforcing "Game-Only" scenarios).

## 3. Global Ecosystem Configurations

Worlds share a foundational set of physical laws (Immutable Data) but allow the Lord to tweak specific atmospheric dials (Mutable Data).

### Immutable Configuration (System Level)
Set upon the genesis of the Septopus Engine and cannot be altered by individual Lords.
- **Time Dilation**: E.g., The ratio of Septopus Time to Real-World Time (default 20x faster).
- **Celestial Bodies**: Standardized skybox configurations (1 Sun, 3 Moons).
- **Total Worlds**: 96 (6 cube faces × 4×4).

> **The block grid is no longer listed here** (2026-07-27): `range`/`block`/`diff` moved to the "World geometry" table in §1 as **Lord-level mutable configuration**, declared by the world document. The `1..1048576` blocks / `0.01..1024` metres bounds stated there are **defensive implementation limits** (they stop a corrupt document producing NaN coordinates or an allocation-sized grid), not the semantics of a dial a Lord tunes.

### 3.1 Deterministic Calendar & Weather Derivation (Normative)

> "Data is logic": the world's CALENDAR (year/month/day) and weather derive as
> pure functions of **chain height + chain hash** — any engine (TS / UE) must
> produce the SAME calendar date and the SAME rain for the same inputs.
> Hour/minute/second (the moment-to-moment time of day) are explicitly
> OUT of this contract — see the "Calendar / sub-day boundary" note below and
> §3.2. Reference implementation: `engine/src/core/systems/EnvironmentSystem.ts`.

**Inputs**: `height` (chain block height), `hash` (`0x`-prefixed hex string,
length ≥ 20), `interval` (chain block interval, seconds), `epoch` (genesis start
height, default 0), `speed` (time-flow multiplier, default 1.0).

**World calendar** (fixed-unit, day granularity — NOT hour/minute/second):
```
elapsed = max(0, height − epoch) × interval × speed        (seconds)
year  = elapsed ÷ 31104000 (= 360 days), then with the remainder:
month = ÷ 2592000 (= 30 days) · day = ÷ 86400 (remainder discarded)
```
Every unit is assigned **unconditionally** (crossing a year boundary must reset
month/day to 0, never keep stale values).

**Weather** (hash slices; character positions count **after stripping the `0x`
prefix**, 0-based):
```
category = parseInt(hash[10..11], 16) mod 4  →  0 clear · 1 cloud · 2 rain · 3 snow
grade    = parseInt(hash[12..13], 16) mod 4  →  0..3 (intensity)
```
A slice that fails to parse counts as 0. **Thunderstorm predicate**:
`category == rain && grade ≥ 1`.

**Semantic / renderer boundary**: `(year, month, day, category, grade, storm
predicate)` are **semantic** (must match across engines); sun angle, light
intensities, the lightning flash envelope and particle density are
**renderer-defined** (behavior-equivalent, per the adjunct protocol §6 "same
effect" boundary).

**Calendar / sub-day boundary (2026-07-13)**: hour/minute/second are **not**
derived from chain height/hash at all — they are a LOCAL, chain-independent
client simulation (a continuously-advancing sub-day clock, `localDaySeconds`
real seconds per full cycle; see §3.2). Rationale: under the §3.2 "1 Bitcoin
block = 1 day" convention, `interval` is an exact multiple of a day, so an
hour/minute/second derived the same way as year/month/day would ALWAYS compute
to zero — the sun would freeze at a fixed hour and only ever jump between
blocks, defeating the point of a day/night cycle. Splitting the derivation
this way keeps the calendar date chain-verified (semantic) while letting the
sun move continuously and independently (ambiance, not semantic — same
boundary the sun-angle/light-intensity renderer split already draws, just
pushed one level up to include the raw hour/minute/second numbers themselves).

### 3.2 Reference Chain Binding: Bitcoin (Normative)

The formula in §3.1 is chain-agnostic by design, but a specific World must bind
to ONE concrete chain so every engine derives the identical calendar. The
reference client binds to **Bitcoin**: `height`/`hash` are the current tip's
block height and block hash, read from any Bitcoin light client or public
explorer (no account, no RPC key, no smart contract — pure public data).
Rationale: Bitcoin is already this project's anchor chain for boot-time content
versioning (`protocol/{cn,en}/boot-chain.md`'s `{p,name,version,cid}` anchor) —
one external dependency, not two — and its hash is a permissionless,
hard-to-manipulate public randomness source.

**Convention: 1 Bitcoin block = 1 Septopus day.**
```
interval = 86400   (seconds of Septopus world-time per block)
speed    = 1.0     (engine default — bin B, §9 — unchanged)
epoch    = <the Bitcoin height at world genesis, chosen by the Lord at launch>
```
Bitcoin's own real cadence (~600 s/block on average, difficulty-retargeted
every 2016 blocks to hold that average — individual blocks vary from seconds
to over an hour) is **not** wired through as a measured, per-block value: two
clients observing the same `(height, hash)` must derive the same calendar date
regardless of how long that particular block actually took to mine, so
`interval` is the fixed protocol constant above, never a measured gap.
Reference implementation: `client/core/src/lib/loader/BtcClock.ts` (polls
public Esplora-compatible explorers on a ~60 s cadence; a block only actually
arrives roughly every 10 minutes, so most polls see no height change — expected,
not a bug; the reference implementation gates it behind a `VITE_BTC_CLOCK`
switch). Dev/demo builds without a live network feed use a synthetic mock
ticker instead (`EnvClock.ts`, the dev/e2e default) to advance the CALENDAR at a much faster,
arbitrary cadence for legibility while testing — the mock is **not** part of
this normative binding and never claims to represent real Bitcoin state. Note
that swapping BtcClock ↔ EnvClock only changes how fast the CALENDAR (day
count) advances; per §3.1 the sun's hour/minute/second never come from either
clock, so the day/night cycle looks identical either way (see `localDaySeconds`
below).

**Sub-day pacing default**: `localDaySeconds = 600` (10 real minutes per full
local day/night cycle, `GlobalConfig.time.localDaySeconds`) — chosen to roughly
match Bitcoin's own average block spacing, so a sun cycle and a calendar-day
tick feel like they're pacing each other even though (per §3.1) they are
mechanically independent and never forced into lockstep. A world doc's `time`
section may override it like `speed`/`epoch`.

### Mutable Configuration (Lord Level)
Stored in a smart contract and configurable by the World's Lord.
```json
{
    "world": {     
        "nickname": "Neon Genesis",        
        "mode": ["ghost", "normal", "game"],     
        "accuracy": 1000,
        "range": [4096, 4096],
        "block": [16, 16, 16],
        "diff": 0.1
    },
    "block": {     
        "elevation": 0,       
        "max": 30,            
        "color": 0x10b981,     
        "texture": 2          
    },
    "player": {
        "start": {
            "block": [2025, 619],   
            "position": [8, 8, 0],   
            "rotation": [0, 0, 0]   
        }
    }
}
```

### Configuration Hierarchy
1.  **Septopus Engine Core Config**: The immutable laws of the engine, **plus the protocol defaults a world document may omit** (§1's geometry defaults, §9's bucket-B table). This tier is the FALLBACK, not the READ POINT — an engine must consult the world document first.
2.  **World Config**: The Lord's customized environment, **including the world geometry of §1**.
3.  **Avatar/Block Config**: Individual Player or Landowner localized data overrides.

## 5. Coordinate & Rotation Contract (Normative)

Every engine implementation must honour these semantics, or the same data will
resolve into differently-posed worlds.

### 5.1 Axis order

- **Septopus (data) axis order**: `X east · Y north · Z up`, metres; in-block
  coordinates are relative to the block's **south-west corner**; block ids
  `[bx, by]` start at `[1,1]` and run to the world's declared `world.range`
  (§1; 4096×4096 in the reference world).
- **Block offsets are computed per axis**: engine-absolute =
  `(bx−1) × block[0] + east` / `(by−1) × block[1] + north`. Each horizontal
  axis uses **its own** block extent — neither the grid nor a block need be square.
- Engines choose their internal frames freely (the reference uses Three.js
  X-right/Y-up/Z-forward with north = −Z), but **data is always written and
  stored in the Septopus axis order**; implementations convert on load/persist.

### 5.2 Rotation (Euler order and frame)

- Adjunct `[rx, ry, rz]`: **radians, engine-frame Euler XYZ, about the
  geometric centre**. It is applied in the engine frame **without** any
  heading conversion — i.e. **yaw about the vertical axis lives at index 1**
  (engine Y = up).
- This is a deliberate asymmetry: **positions are authored in the Septopus frame,
  rotations in the engine frame**. Author content accordingly; a new engine
  aligns by treating `[rx,ry,rz]` as XYZ Euler angles in a right-handed
  X-right/Y-up/Z-forward frame applied about the centre (perceptual
  equivalence, not bit equality).
- **Player heading is the exception**: player yaw uses navigation semantics
  (0 = facing north, increasing clockwise — compass heading), with the fixed
  conversion `heading = −engineYaw`. Only player spawn/persistence goes
  through this conversion; adjunct rotations never do.

### 5.3 Sizes

`size` is always a **full-length bounding box** (not half extents), Septopus axis
order `[east-west, north-south, height]`; exceptions (a6 cone, a7 ball
diameter semantics) are listed in [adjunct-types.md](adjunct-types.md).

## 9. Engine-constant binning (normative, 2026-07-09)

Implementation constants are binned three ways (base-data audit P9/D6,
**revised 2026-07-27**):

**Protocol invariants** (shared by all worlds, never overridable): **96 worlds**.
That is the whole list — it is a property of the cosmic cube, not of any single
world.

> **The block grid and block size left this bin** (it used to read "the 4096×4096
> block grid, 16×16×16 m blocks, 0.1 m height granularity, never overridable").
> They are now **mutable configuration declared by the world document** — see the
> "World geometry" table in §1. Their VALUES still default to 4096×4096 / 16 m /
> 0.1 m, but **an engine must read them from the document and must not hardcode
> them.** Driver: on-chain world configuration management must be able to define
> a world's grid.

**Protocol defaults (bin B)** — every engine must use the same value when the
data omits it:

| quantity | default | world-data override |
|---|---|---|
| gravity | **−19.62 m/s²** (a deliberate 2× standard-gravity feel value, pinned as such) | `player.capacity.gravityMultiplier` (scale) |
| player health | 100/100 | `player.capacity.maxHp` |
| interaction reach | **3.5 m** (player→hit point, not camera; Edit mode exempt) | `player.capacity.reach` |
| world grid | `[4096, 4096]` blocks | `world.range` (§1) |
| block size | `[16, 16, 16]` m, Septopus axis order | `world.block` (§1) |
| height granularity | 0.1 m | `world.diff` (§1) |
| simulation tick | 0.1 s (10 Hz grid/state sync) | — |
| block streaming radius | 2 (a 5×5 neighbourhood) | — |
| LOD near bound | 40 m | `world.performance.lodNear` |
| time calendar | epoch 0 · speed 1.0 · localDaySeconds 600 | the world doc's `time` section (`{epoch, speed, localDaySeconds}`) |
| void-recovery depth | 20 m | `player.capacity.voidRecover` |

**Client presentation (bin C, non-normative)** — implementation-defined, never
constrained by the protocol: mouse/touch sensitivity, stick deadzones, camera
FOV/near/far, minimap frustum, camera shake/sink, auto-level rate.
