# Septopus Adjunct Protocol

Within the **Septopus Engine**, "Adjuncts" (附属物) are the fundamental atoms for building physical content, rendering 3D objects, and implementing dynamic interactivity. The engine runs the world by managing the lifecycle of these adjuncts.

Within this system, there exists a special class of **Meta-Adjuncts**. For example, the **`spp` adjunct** does not directly represent a visual object, but instead acts as an "announcer" responsible for parsing string particle data and deriving other adjuncts.

Adjuncts are designed to be completely decoupled from the core engine. They can be dynamically loaded from IPFS, blockchain smart contracts, or local servers. Once loaded, they operate within the ECS (Entity-Component-System) structure to map standard data parameters into rich 3D visuals and programmable behaviors.

---

## 1. Architecture & Security

Adjuncts are parsed and executed within an isolated environment (or sandbox) to prevent malicious code from accessing sensitive global APIs like `window`, `document`, or `fetch`.

- **Coordinate System**: Adjuncts operate within the standard SPP Block Coordinate System.
- **Data Flow**: The engine feeds raw block data into the Adjunct. The Adjunct transforms this raw data into standard 3D parameters (`position`, `scale`, `rotation`, `material`), which the engine's rendering pipeline then converts into Three.js object meshes.
- **Extensibility**: Different Septopus "Worlds" can whitelist specific Adjuncts to create distinct visual styles and gameplay mechanics (e.g., a whitelist allowing "Laser Door" and "Jump Pad" adjuncts).

---

## 2. Adjunct Interface Definition (API)

Every Adjunct must export a standard object containing specific functional domains. In the modern TypeScript ECS implementation, this typically includes `hooks`, `transform`, and `menu`.

```typescript
export const CustomAdjunct = {
    hooks: {
        // Provide adjunct metadata (name, version, supported events like 'touch', 'in')
        reg: () => {}            
    },
    transform: {
        // Raw on-chain compressed array -> SPP Standard Data
        raw_std: (arr: any[], cvt: number) => {},
        // SPP Standard Data -> Raw compressed array (for saving to string)
        std_raw: (arr: any[]) => {},
        // Converts SPP Standard Data array into specific 3D render/engine parameters
        std_3d: (stds: any[], elevation: number) => {} 
    },
    menu: {
        // Returns the sidebar property editor form configurations for the object
        sidebar: (std: any) => {}             
    }
};
```


---

## 3. Data Transformation Pipeline

The `transform` property is the core of an Adjunct. It acts as the bridge between compact storage and rich 3D rendering.

| Method | Source | Destination | Purpose |
|---|---|---|---|
| `raw_std` | Raw Data (`raw`) | Standard Data (`std`) | Decodes compressed on-chain/IPFS strings into readable JS objects for the engine. |
| `std_raw` | Standard Data (`std`) | Raw Data (`raw`) | Re-encodes edited data back into compact strings for saving to the blockchain. |
| `std_3d` | Standard Data (`std`) | 3D Render Data | Converts standards into precise `size`, `position`, `rotation` for generating Three.js meshes. |
| `std_2d` | Standard Data (`std`) | 2D Render Data | Generates SVG/Canvas objects for top-down mini-maps or UI projections. |

### Minimum Standard Data Format
To render in the 3D world, the `std_3d` output must contain at least:
*   `size`: `[x, y, z]` (numeric dimensions)
*   `position`: `[ox, oy, oz]` (world offset coordinates)
*   `rotation`: `[rx, ry, rz]` (Euler angles)

---

## 4. Interaction & Events

Adjuncts can register support for various spatial and interaction events via `hooks.reg().events`.

**Supported System Events:**
*   `in`: Player enters the Adjunct's spatial boundaries.
*   `out`: Player exits the boundaries.
*   `hold`: Player remains inside the boundaries for a duration.
*   `beside`: Player is standing next to the Adjunct.
*   `under`: Player is standing directly beneath the Adjunct.
*   `touch`: Player interacts with the Adjunct (e.g., crosshair Raycast click).

Events can trigger custom animations (via `hooks.animate`) or execute specific functions defined in the `task` router. For security, tasks can be marked with `gameonly: true` to prevent them from executing in standard editing or viewing modes.

---

## 5. Resource Loading

If an Adjunct requires external assets (like textures or 3D models `.glb`), it must declare them during the `transform.raw_std` phase. The engine intercepts these declarations and handles the asynchronous loading to prevent UI stuttering.

Adjuncts reference resources via **integer IDs**. For storage format, addressing schemes, and fetch flow, see the [Resource Protocol](./resource.md).

| Resource Type | Reference in Data | Description |
|---|---|---|
| Image (Texture) | `adjunct raw[3]` = texture resource ID | Texture resource, applied as diffuse/color map |
| 3D Model (Module) | `adjunct raw[3]` = module resource ID | Replaces standard geometry with a fully loaded 3D asset |
| Audio | `STD_ROW.audio.resource` | 3D spatial audio |

## 6. Rendering Realization Contract

> "Data is logic" requires pinning down *how* std_3d geometry/material is realized — otherwise a different engine (UE) builds a different world. Rotation/coordinates: see [Coordinate System](../../docs/architecture/coordinate.md#31-旋转的欧拉序与坐标系跨引擎契约).

- **Size axis mapping**: std `size = [x, y, z]` is **SPP [East, North, Alt]** full extent, mapped to engine box dims **[width=East, height=Alt, depth=North]** (`Coords.getBoxDimensions`). **Pivot = geometry center.**
- **Primitive semantics**: `box(w,h,d)` centered full-extent; `sphere` radius = `w/2`; `cylinder/cone(w,h,d)`; `plane(w,h)`; `tube` = Catmull-Rom extrusion along control points. **Segment counts (e.g. sphere 32×32) are pixel-level detail — engines may differ** (behavior-equivalent).
- **World-space UV tiling (constant texel density)**: textures tile by **world size**, not stretched per face — `repeat_per_face = faceSizeMeters / TILE_METERS`, `TILE_METERS = 2` (one tile per 2 m). So a 16 m floor and a 1 m crate look equally crisp. `material.repeat` is an **additional multiplier on top**. (UE must implement the same density formula to match.)
- **Color**: the norm is **authoring an explicit hex color** (`material.color`). Box's `resource index → palette color` (e.g. `10→#eee`, `1→#555`) is a **legacy demo convenience, non-normative** — store hex for cross-engine content, don't rely on the index palette.
- **"Same effect" boundary**: geometry placement/orientation/size/UV-density are **semantic** (must match); shading/lighting/tonemapping/shadows/camera/segment-counts are **renderer-defined** (behavior-equivalent, not bit-identical).
