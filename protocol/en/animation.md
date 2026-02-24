# Septopus Animation Protocol

The **Septopus Engine** includes a set of standardized animation specifications that define how spatial nodes (adjuncts) transform and update over time. The SPP protocol provides the data-driven descriptions for these sequences, ensuring uniform behavior across different environments.

By standardizing animations into a predefined timeline definition, the engine can execute these purely via data-driven systems (like an ECS `AnimationSystem`), removing the need for hardcoded per-object update scripts.

## Core Animation Structure

An animation object must define a global strategy (loops, delays, target) and a local `timeline` of discrete execution blocks.

```json
{
  "name": "AnimationName",
  "target": {                   
    "x": 2025,
    "y": 667,
    "world": 0,
    "adjunct": "box",
    "index": 1
  },
  "duration": 3000,             
  "loops": 0,                   
  "pending": 2000,              
  "timeline": [
    // ... animation instructions
  ]
}
```

### Global Configuration

| Property | Type | Description |
|---|---|---|
| `name` | `string` | A descriptive name for the animation sequence. |
| `target` | `object` | The execution target of the animation. Optional if bound directly to an entity. |
| `duration` | `number` | The total cycle time of the animation in milliseconds. `0` indicates continuous/endless execution if `loops` is also 0. |
| `loops` | `number` | The number of times the animation should repeat. `0` indicates an endless loop. |
| `pending` | `number` | Delay (in ms) before the animation begins, or the waiting time between consecutive loops. |
| `timeline`| `array`  | An array of action steps describing the animation over time. |

---

## Timeline Execution Steps

The `timeline` is an array of objects. Each object dictates a specific transform or property change during a defined time window.

```json
{
  "time": [0, 2000],
  "type": "rotate",
  "axis": "Y",
  "mode": "add",
  "value": 0.2
}
```

### Timeline Properties

#### 1. `time` (Temporal Definition)
Specifies when the action occurs during the parent animation's `duration`.
*   **Number**: e.g., `0` or `1000`. The action starts at the exact millisecond mark.
*   **Array (Tuple)**: e.g., `[start, end]`. The action processes continuously across the duration from start to end.

#### 2. `type` (Animation Target)
Defines what property is being manipulated.

| Type | Description | Engine Implementation |
|---|---|---|
| `move` | Spatial translation. | Modifies `Three.js` Mesh `position`. |
| `rotate` | Spatial rotation. | Modifies `Three.js` Mesh `rotation`. |
| `scale` | Size scaling. | Modifies `Three.js` Mesh `scale`. |
| `color` | Solid material color change. | Animates `Three.js` Mesh material `.color`. |
| `texture`| Material texture swapping. | Swaps active Texture IDs on the mesh material. |
| `opacity`| Transparency fading. | Animates `Three.js` Mesh material `.opacity`. |
| `morph` | Geometry swapping/morphing. | Swaps or interpolates `Three.js` Geometries. |
| `fall` | Camera/viewpoint effect. | Can be used when `category: "camera"`. |

#### 3. `axis` (Direction/Vector)
Defines the axis of manipulation (primarily for `move`, `rotate`, and `scale`).
*   **Valid Values**: `"X"`, `"Y"`, `"Z"`, `"XY"`, `"XZ"`, `"YZ"`, `"XYZ"`.

#### 4. `mode` (Value Interpolation Strategy)
Defines how the `value` is applied to the base property during the `time` interval.

| Mode | Input Value Type | Behavior |
|---|---|---|
| **`add`** | `number` | Adds the value incrementally (e.g., continuous rotation by `0.2` radians per frame). |
| **`set`** | `number` | Hard-sets the property to the value. |
| **`set`** | `number[]` (size > 2) | Sequentially lerps/steps through the array elements across the time window. |
| **`multi`**| `number` / `number[]` | Multiplies the base property by the given value. |
| **`random`**| `[min, max]` | Picks a random value between `min` and `max` interval. |
| **`random`**| `number[]` (size > 2) | Randomly picks an element from the provided array. |

#### 5. `value` (Data Payload)
The numeric multiplier, angle, coordinate, or hex color to apply.
*   If `value` is passed as a function (in JS runtimes), the engine evaluates the function dynamically.
*   *Note: For strict data-serialization (JSON/Chain), `value` should remain numeric or arrays of numbers.*

#### 6. `repeat` (Local Cyclical Rate)
*(Optional)* Defines harmonic oscillation or segmentation during the specific interval.
*   If set, the `time` window is chopped into `repeat` segments, oscillating or flashing the value repeatedly within that single timeline block.

#### 7. `category` (Domain Context)
*(Optional)* Differentiates the type of object. E.g., setting `"category": "camera"` implies the timeline manipulates the First-Person perspective instead of a spatial mesh.

---

## Example Sequences

### Endless Floating (Sine-like Bobbing)
```json
{
  "name": "Floating",
  "duration": 2000,
  "timeline": [
    {
      "time": [0, 1000],
      "type": "move",
      "mode": "add",
      "axis": "Y",
      "value": 0.05
    },
    {
      "time": [1000, 2000],
      "type": "move",
      "mode": "add",
      "axis": "Y",
      "value": -0.05
    }
  ]
}
```

### Warning Flasher
```json
{
  "name": "AlertFlash",
  "duration": 1000,
  "loops": 5, 
  "timeline": [
    {
      "time": [0, 1000],
      "type": "color",
      "mode": "set",
      "repeat": 4,
      "value": [0xFF0000, 0xFFFFFF]
    }
  ]
}
```
