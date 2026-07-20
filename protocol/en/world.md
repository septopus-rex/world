# Septopus World Protocol

Within the **Septopus Engine**, a "World" (`world`) is the highest-level administrative and physical bounding box. A Septopus World consists of a continuous grid of Blocks, and is governed by global physics, atmospheric conditions, and access rules enforced by the engine. Content organization within these blocks (e.g., via the SPP protocol) is a specific implementation layer within this management framework.

## 1. World Architecture & Layout

The Septopus metaverse is composed of a fixed number of overarching Worlds.
*   **Total Worlds**: 96 individual Worlds.
*   **Macro Structure**: The 96 worlds are mathematically mapped onto the 6 faces of a massive cosmic cube (4x4 worlds per face).
*   **World Dimensions**: A single World is a bounded grid of `4096 x 4096` Blocks.
*   **Block Dimensions**: A single Block represents an area of `16m x 16m`.

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
- **Maximum Block Expansion**: The hard limit of `4096 x 4096`.

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
        "accuracy": 1000     
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
1.  **Septopus Engine Core Config**: The immutable laws of the engine.
2.  **World Config**: The Lord's customized environment.
3.  **Avatar/Block Config**: Individual Player or Landowner localized data overrides.

## 5. Coordinate & Rotation Contract (Normative)

Every engine implementation must honour these semantics, or the same data will
resolve into differently-posed worlds.

### 5.1 Axis order

- **Septopus (data) axis order**: `X east · Y north · Z up`, metres; in-block
  coordinates are relative to the block's **south-west corner**; block ids
  `[bx, by]` start at `[1,1]` (a 4096×4096 world grid).
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

Implementation constants are binned three ways (base-data audit P9/D6):

**Protocol invariants** (§1; shared by all worlds, never overridable): the
4096×4096 block grid, 16×16×16 m blocks, 0.1 m height granularity, 96 worlds.

**Protocol defaults (bin B)** — every engine must use the same value when the
data omits it:

| quantity | default | world-data override |
|---|---|---|
| gravity | **−19.62 m/s²** (a deliberate 2× standard-gravity feel value, pinned as such) | `player.capacity.gravityMultiplier` (scale) |
| player health | 100/100 | `player.capacity.maxHp` |
| interaction reach | **3.5 m** (player→hit point, not camera; Edit mode exempt) | `player.capacity.reach` |
| simulation tick | 0.1 s (10 Hz grid/state sync) | — |
| block streaming radius | 2 (a 5×5 neighbourhood) | — |
| LOD near bound | 40 m | `world.performance.lodNear` |
| time calendar | epoch 0 · speed 1.0 · localDaySeconds 600 | the world doc's `time` section (`{epoch, speed, localDaySeconds}`) |
| void-recovery depth | 20 m | `player.capacity.voidRecover` |

**Client presentation (bin C, non-normative)** — implementation-defined, never
constrained by the protocol: mouse/touch sensitivity, stick deadzones, camera
FOV/near/far, minimap frustum, camera shake/sink, auto-level rate.
