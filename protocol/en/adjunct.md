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

| Resource Type | Mounting Location in Data | Purpose |
|---|---|---|
| Image (Texture) | `STD_ROW.material.texture` | Applied as a diffuse/color map on generated box geometries. |
| 3D Model (.glb) | `STD_ROW.module` | Replaces standard geometry generation with a fully loaded 3D asset. |
