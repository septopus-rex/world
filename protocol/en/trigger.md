# SPP Trigger Protocol

The **String Particle Protocol (SPP)** creates interactivity through a data-driven Trigger system. Instead of writing custom logic scripts for every object, creators define conditional arrays that the engine evaluates in real-time. 

Triggers are the primary mechanism for implementing gameplay logic, environment hazards, and state changes.

## 1. Trigger Architecture

A Trigger monitors for specific spatial **Events**, evaluates a set of **Conditions**, and if `true`, executes a set of **Actions**. It can optionally define exit conditions and recovery actions.

**Execution Flow**:
`Event TRIGGERED -> Evaluate CONDITIONS -> Execute ACTIONS -> Evaluate EXIT CONDITIONS -> Execute RECOVERY ACTIONS`

## 2. Object Targeting (Addressing)

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

## 3. Events

Events are emitted by the engine's spatial and interaction systems. Triggers listen for these events to begin evaluation.

- `in`: Player enters the Trigger's spatial volume.
- `out`: Player exits the Trigger's spatial volume.
- `hold`: Player remains inside the volume for a specific duration.
- `touch`: Player interacts directly (e.g., crosshair click).

## 4. Conditions & Actions

Once an event is fired, the Trigger evaluates conditions before applying actions.

### 4.1 Conditions (判断条件)

Format: `[ TargetAddressArray, Operator, Value ]`

**Operators**:
- `0`: Not Equals (`!=`)
- `1`: Equals (`==`)
- `2`: Greater Than (`>`)
- `3`: Less Than (`<`)
- `4`: Greater Than or Equal (`>=`)
- `5`: Less Than or Equal (`<=`)

*Note: A Trigger can have multiple conditions. By default, all conditions must evaluate to `true` (AND logic) for the actions to execute.*

### 4.2 Actions (修改方式 / Tasks)

Format: `[ TargetAddressArray, ModifierOption, Value, (Optional Animation Index) ]`

**Modifier Options**:
- `0`: Set (`=`) - Hardcode the target property to the new value.
- `1`: Add (`+=`) - Increment or decrement the target property.
- `2`: Random - Apply a random value within the specified constraint.

### 4.3 Recovery Actions (恢复动作)

To prevent permanent, destructive alterations to the world state, Triggers cache the original state of their targets. 
If an Exit Condition is met, the Recovery Action automatically reverts the target to its cached state. This is highly useful for temporary buffs or timed puzzle doors.

## 5. Security Contexts

Because Triggers can modify inventory and player capabilities, they are subject to execution permissions based on the active World Mode.
- **Normal Mode**: Can trigger environment changes and animations.
- **Game Mode**: Can trigger inventory changes and health/stat modifications.
- **Ghost Mode**: All triggers are disabled.
