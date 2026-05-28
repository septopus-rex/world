# Septopus Trigger Protocol

The **Septopus Engine** implements interactive logic through a data-driven Trigger system. This mechanism allows creators to define combinations of events and conditions without writing complex scripts, which the engine then evaluates at runtime to modify the world state.

Triggers are the primary mechanism for implementing gameplay logic, environment hazards, and state changes.

## 1. Trigger Architecture

A Trigger is composed of two parts:

- **Volume**: A non-rendered geometric detection region used to detect a player entering / exiting / dwelling.
- **Logic Nodes**: A list of logic attached to the same volume. **A single volume may bind multiple events** (e.g. open a door on `in`, close it on `out`); each logic node independently holds its own conditions, actions, and recovery actions.

Each logic node follows this execution flow:

`Event TRIGGERED -> Evaluate CONDITIONS -> Execute ACTIONS -> Evaluate EXIT CONDITIONS -> Execute RECOVERY ACTIONS`

## 2. Trigger Volume

The volume participates only in mathematical detection and produces no visible mesh.

| Field | Type | Description |
|---|---|---|
| `shape` | `0` \| `1` \| `2` | Shape: `0`=Box, `1`=Sphere, `2`=Cylinder. |
| `size` | `[x, y, z]` | Volume extents. Box uses each axis as **full length**; Sphere uses `x` as radius; Cylinder uses `x` as radius and `z` as height. |
| `offset` | `[x, y, z]` | Local offset relative to the adjunct origin. |
| `rotation` | `[x, y, z]` | Relative rotation, used for OBB (Oriented Bounding Box) detection. |

**Runtime detection (multiplayer-aware)**: The volume tracks the "is inside" state per **participant entity**. Under Game Mode with multiple connected players (WebRTC multiplayer), each connected player is evaluated independently and does not affect another's enter/dwell/exit state.

## 3. Events

Events are emitted by the engine's spatial and interaction systems. Logic nodes listen for these events to begin evaluation.

- `in`: Player enters the Trigger's spatial volume (fires once on the entering frame).
- `out`: Player exits the Trigger's spatial volume (fires once on the exiting frame).
- `hold`: Player remains inside the volume **for a continuous duration reaching the `holdDuration` threshold**.
- `touch`: Player interacts directly (e.g. crosshair click).

> The dwell duration for `hold` is defined by the logic node's `holdDuration` (milliseconds), not fired every frame. It fires once when the threshold is reached; for periodic firing, the implementation may re-evaluate at `holdDuration` intervals.

## 4. Logic Node

A logic node is the smallest logical unit of a trigger, binding a single event to its conditions and actions.

| Field | Type | Description |
|---|---|---|
| `event` | `"in"` \| `"out"` \| `"hold"` \| `"touch"` | The event type being listened for. |
| `holdDuration` | `number` (ms) | Used only by the `hold` event; the dwell threshold. |
| `conditions` | `Condition[]` | Preconditions; all must pass (AND) before actions run. Empty array means unconditional. |
| `actions` | `Action[]` | The modifying actions executed when conditions pass. |
| `exitConditions` | `Condition[]` | Optional. Exit conditions that decide whether recovery actions should run. |
| `recovery` | `Action[]` | Optional. Reverts targets to their cached original state when exit conditions are met. |
| `runOnce` | `0` \| `1` | Optional. `1` means the node fires only once and is then disabled. |

**Example (one volume binding both open-on-enter and close-on-exit):**
```json
{
  "volume": { "shape": 0, "size": [4, 4, 4], "offset": [0, 0, 0], "rotation": [0, 0, 0] },
  "gameOnly": 0,
  "logic": [
    {
      "event": "in",
      "conditions": [],
      "actions": [ [ [1, 161, 0, 1, 2], 0, 90, 0 ] ]
    },
    {
      "event": "out",
      "conditions": [],
      "actions": [ [ [1, 161, 0, 1, 2], 0, 0, 0 ] ]
    }
  ]
}
```

## 5. Object Targeting (Addressing)

To modify the world, Triggers must mathematically select their target. SPP uses a hierarchical array format for targeting.

| Target Type | Primary ID | Description |
|---|---|---|
| **System** | `0` | Global environment variables (UI, Time, Weather, Sky). |
| **Adjunct** | `1` | Other 3D objects in the world. |
| **Player** | `2` | Player stats, positioning, and movement capabilities. |
| **Bag/Inventory**| `3` | The player's inventory items and quantities. |

### Addressing Format Examples

**Targeting an Adjunct's Property:**
```json
[
  1,        // Primary Type: Adjunct
  0x00A1,   // Short ID of the specific Adjunct type (e.g., a "Door")
  0,        // Index (if multiple exist on the block)
  1,        // Target Property (e.g., Rotation)
  2         // Sub-property (e.g., Z-axis)
]
```

**Targeting the Player's Health:**
```json
[
  2,        // Primary Type: Player
  5         // Target Property: Health
]
```

## 6. Conditions

Format: `[ TargetAddressArray, Operator, Value ]`

**Operators**:
- `0`: Not Equals (`!=`)
- `1`: Equals (`==`)
- `2`: Greater Than (`>`)
- `3`: Less Than (`<`)
- `4`: Greater Than or Equal (`>=`)
- `5`: Less Than or Equal (`<=`)

*Note: A logic node can have multiple conditions. By default, all conditions must evaluate to `true` (AND logic) for the actions to execute.*

## 7. Actions (Tasks)

Format: `[ TargetAddressArray, ModifierOption, Value, (Optional Animation Index) ]`

**Modifier Options**:
- `0`: Set (`=`) - Hardcode the target property to the new value.
- `1`: Add (`+=`) - Increment or decrement the target property.
- `2`: Random - Apply a random value within the specified constraint.

The optional 4th element, the **Animation Index**, points to an entry in the block's animation table, presenting the modification as an animated transition (e.g. interpolated door rotation).

## 8. Recovery Actions

To prevent permanent, destructive alterations to the world state, Triggers cache the original state of their targets.
If the logic node's defined **Exit Condition** is met, the Recovery Action automatically reverts the target to its cached state. This is highly useful for temporary buffs or timed puzzle doors.

## 9. Security Contexts

Because Triggers can modify inventory and player capabilities, they are subject to execution permissions based on the active World Mode.

- **Normal Mode**: Can trigger environment changes and animations.
- **Game Mode**: Can trigger inventory changes and health/stat modifications.
- **Ghost Mode**: All triggers are disabled.

Additionally, a volume may declare itself **Game-Mode-only** via the `gameOnly` flag: when `gameOnly = 1`, the trigger does not participate in evaluation during Normal browsing mode and is active only when Game Mode is engaged.
