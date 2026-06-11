# Septopus Trigger Protocol

The **Septopus engine** implements interaction through a data-driven trigger system: instead of scripting, creators define "event + conditions + actions" combinations as data, and the engine evaluates them at runtime to mutate world state.

Triggers are the primary mechanism for gameplay logic, environmental contraptions, and state changes.

> This document maps 1:1 to the implementation: type definitions in
> `engine/src/core/types/Trigger.ts`, runtime in
> `engine/src/core/systems/TriggerSystem.ts`, raw codec in
> `engine/src/plugins/adjunct/adjunct_trigger.ts`. For system-level behavior
> (lifecycle, mode permissions, multiplayer awareness) see `docs/systems/trigger.md`.

## 1. Trigger Architecture

A trigger (adjunct type `b8`, typeId `0x00b8`) consists of two parts:

- **Volume**: a geometric containment region (box/sphere). Pure walk-through volumes render nothing; a volume carrying a `touch` node emits an **invisible but raycastable** mesh (Three.js raycasters still hit `visible=false` objects — the engine uses this for "invisible buttons").
- **Logic Nodes**: a list of logic attached to the same volume. **A single volume may bind multiple nodes** (open on `in`, close on `out`, time on `hold`); multiple nodes of the same type ALL fire in order. Each node independently holds its own event type, conditions, actions and fallback actions.

Per-node execution flow:

`event fires → evaluate conditions (JSONLogic) → true: run actions / false: run fallbackActions`

## 2. Raw Format (b8 slot map)

One `b8` row in block raw is a **positional array**:

```
[ size, offset, rotation, shape, gameOnly, events ]
```

| Slot | Field | Type | Description |
|---|---|---|---|
| 0 | `size` | `[x, y, z]` | Volume extents (meters) in **SPP axis order** (X=East, Y=North, Z=Alt); full lengths for a box; `x` is the radius for a sphere. |
| 1 | `offset` | `[x, y, z]` | Position relative to the block origin (meters), SPP order — same semantics as other adjuncts' `pos`. |
| 2 | `rotation` | `[x, y, z]` | **Reserved.** The in/out/hold containment test is axis-aligned (AABB) and ignores rotation; only the `touch` raycast mesh applies it. |
| 3 | `shape` | `1` \| `2` | `1` = box, `2` = sphere. Default `1`. |
| 4 | `gameOnly` | `0` \| `1` | `1` = evaluated only in Game mode. **Defaults to `1`** — always-on contraptions must write `0` explicitly. |
| 5 | `events` | `TriggerLogicNode[]` | Logic node list, below. |

**Coordinates**: author `size`/`offset` in SPP order; the engine converts to its internal axes on load (`Coords.getBoxDimensions` etc.).

## 3. Events

| Event | Fires when |
|---|---|
| `in` | The frame the player enters the volume — once (edge-triggered). |
| `out` | The frame the player leaves the volume — once (edge-triggered). |
| `hold` | The frame the accumulated stay **crosses the `holdDuration` millisecond threshold** — once. |
| `touch` | The player's primary interact ray (click / KeyE) hits the volume; routed from `RaycastInteractionSystem`'s `interact` event. |

`hold` details:
- Stay time accumulates from stepped `dt` (deterministic, no wall clock); resets when the player exits.
- **Crossing semantics** (`prevMs <= D < nowMs`): fires once per stay; re-arms automatically after exit and re-entry.
- Absent/zero `holdDuration` → fires on the first frame after entry.

## 4. Logic Node

```ts
interface TriggerLogicNode {
    type: "in" | "out" | "hold" | "touch";
    conditions?: JsonLogicRule;        // optional JSONLogic guard
    actions: TriggerAction[];          // run when conditions pass (or are absent)
    fallbackActions?: TriggerAction[]; // optional, run when conditions fail
    oneTime?: boolean;                 // optional, consumed after one passing run
    holdDuration?: number;             // hold only: stay threshold (ms)
}
```

| Field | Description |
|---|---|
| `type` | The event to listen for. |
| `conditions` | Optional JSONLogic guard (§5). Absent = always true. Evaluation errors count as false. |
| `actions` | Actions to run when conditions pass (§6). |
| `fallbackActions` | Actions to run when conditions **fail** (e.g. hint "press the button first"). Note: this is the else-branch of the condition — NOT the legacy protocol's "recovery actions". |
| `oneTime` | When `true`, the node is consumed after **one passing execution** (conditions met, actions ran). Fallback runs never consume — a locked door stays re-tryable. |
| `holdDuration` | `hold` nodes only. |

## 5. Conditions (JSONLogic)

A condition is a standard [JSONLogic](https://jsonlogic.com/) rule, evaluated by `json-logic-js` against the **WorldContext**:

```json
{ "==": [ { "var": "flags.demo_touch" }, true ] }
```

```json
{ "and": [
    { ">=": [ { "var": "time" }, 0.25 ] },
    { "<":  [ { "var": "time" }, 0.8 ] }
] }
```

### Available variables (WorldContext)

| Variable | Type | Description |
|---|---|---|
| `player.x` / `player.y` / `player.z` | `number` | Player position (**engine axes**: `y` is height). `player.position` is the same as an array. |
| `flags.<key>` | `any` | World-level flags (`world.globalFlags`), writable by `flag` actions — triggers chain state through them. |
| `time` | `number` | World time, 0–1 float (0.5 = noon). |
| `weather` | `string` | Current weather. |

Combine multiple conditions with JSONLogic's own `and` / `or` / `!` — there is no separate "condition array defaults to AND" convention anymore.

## 6. Actions

```ts
interface TriggerAction {
    type: string;            // 'adjunct' | 'flag' | 'system'
    target: string | number; // adjunctId, flag key, or system name
    method: string;
    params: any[];
}
```

| `type` | `target` | `method` | `params` | Effect |
|---|---|---|---|---|
| `adjunct` | adjunctId, format `adj_{bx}_{by}_{typeDecimal}_{idx}` (e.g. `adj_2048_2048_161_0` = wall #0 on that block) | `moveZ` | `[meters]` | Translate the target along the SPP altitude axis (updates Transform AND stdData; collision follows). |
| | | `rotateY` | `[radians]` | Rotate the target around the vertical axis. |
| `flag` | flag key | (empty) | `[value]`, default `true` | Write `world.globalFlags[target]`, readable by other triggers' conditions. |
| `system` | (empty) | `log` | `[...any]` | Console log (debugging). |

> The action surface grows with the roadmap: P2 introduces the `IActuator` /
> `LocalActuator` abstraction and a `contract` branch (same trigger data, local
> simulation in pure mode, swap the injected actuator when chain-connected) — see
> `docs/plan/STANDALONE_ENGINE_ROADMAP.md`. The legacy protocol's player-attribute /
> inventory actions are **not implemented yet**.

## 7. Complete Examples (from the demo court, runnable as-is)

One volume, three nodes — open on enter, close on leave, set a flag after 800 ms:

```json
[[4, 4.5, 6], [8, 11.25, 3], [0, 0, 0], 1, 0, [
  { "type": "in",  "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_0", "method": "moveZ", "params": [3.2] },
      { "type": "flag", "method": "", "target": "demo_gate", "params": [true] } ] },
  { "type": "out", "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_0", "method": "moveZ", "params": [-3.2] },
      { "type": "flag", "method": "", "target": "demo_gate", "params": [false] } ] },
  { "type": "hold", "holdDuration": 800, "actions": [
      { "type": "flag", "method": "", "target": "demo_hold", "params": [true] } ] }
]]
```

A conditional door — JSONLogic guard + `oneTime` + fallback hint:

```json
[[2.2, 2, 4], [14.2, 12, 2], [0, 0, 0], 1, 0, [
  { "type": "in", "oneTime": true,
    "conditions": { "==": [ { "var": "flags.demo_touch" }, true ] },
    "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_1", "method": "moveZ", "params": [3.2] } ],
    "fallbackActions": [
      { "type": "system", "method": "log", "target": "", "params": ["touch the cone button first (demo_touch)"] } ] }
]]
```

## 8. Security Contexts

Triggers obey the active world mode:

- **Edit / Ghost mode**: ALL triggers disabled; queued clicks are dropped too.
- **Normal / Game mode**: triggers evaluate normally.
- Volumes with `gameOnly = 1` evaluate only in Game mode (**this is the default**).

**Multiplayer awareness**: a volume tracks "inside" state and stay time **per participating entity**; multiple players are evaluated independently.

## 9. Compaction

### The trade-off

The legacy protocol expressed conditions as `[addressing, operatorCode, value]` triples for **data compactness** (on-chain bytes are cost). The current protocol uses standard JSONLogic instead, buying expressiveness (arbitrary nesting), an off-the-shelf evaluator (`json-logic-js`, no home-grown interpreter) and tooling compatibility — at the price of larger plaintext.

### The compaction path (mechanical, lossless)

JSONLogic is structurally a `{operator: [args...]}` tree, which **flattens losslessly into positional arrays** `[operatorIndex, args...]` — the generalization of the old triple format. Action objects flatten the same way. Real numbers for the demo court's "conditional door" node:

| Form | Bytes |
|---|---|
| Plain JSON (current storage) | 348 B |
| Flattened positional arrays + operator/action-type tables | 145 B (≈ 2.4×) |
| Plus string dictionary (dedupe adjunctIds / flag paths per block) + binary encoding (CollapseCodec / CBOR) + gzip | typically another 2–4× depending on repetition |

A simple unconditional node compacts similarly (107 B → 51 B).

### Layering principle (important)

**Compaction belongs to the codec layer, not to authoring or runtime.**

```
authoring/runtime       serialize layer                       storage / chain
standard JSONLogic ⇄  flatten + dictionary + binary + gzip ⇄  compact bytes
```

- What creators write and the engine evaluates is **always standard JSONLogic** (`TriggerSystem` is compression-unaware).
- Flatten/restore happens in `serialize`/`deserialize` (the Attribute layer of `adjunct_trigger.ts`), sharing the CollapseCodec pipeline with the other raw slots.

### Status

**Not implemented.** `events` is currently stored as plain JSON in raw slot 5 — negligible cost under local IndexedDB persistence and gzip transport. Compact encoding is planned alongside **P4 chain publishing** (where bytes are real cost); it adds one codec layer, existing plaintext data migrates in one pass, and the runtime stays untouched.

## 10. Differences from the Legacy Protocol (migration map)

| Legacy | Current | Notes |
|---|---|---|
| node field `event` | `type` | Renamed. |
| `runOnce: 0\|1` | `oneTime: boolean` | Renamed + tightened: only a passing execution consumes. |
| `exitConditions` + `recovery` | **Not implemented** | `fallbackActions` is the condition's else-branch, **not** recovery. Restore state with explicit inverse nodes (e.g. `out` closes the door). |
| condition triples `[addressing, op 0-5, value]` | JSONLogic rules | §5; compact encoding in §9. |
| action arrays `[addressing, modifier, value, animIndex]` | `{type, target, method, params}` objects | Animated transitions **not implemented** (actions apply instantly). |
| `shape: 0/1/2` (box/sphere/cylinder) | `1` box / `2` sphere | Cylinder not implemented; note the renumbering. |
| addressing arrays (system/adjunct/player/bag) | adjunctId string / flag key | Player & inventory targets not implemented; extends with P2 actuators. |

**Backward compatibility**: if raw slot 5 is a legacy **flat action array** (entries lacking an `in/out/hold/touch` node type), it is wrapped into a single unconditional `in` node on load.
