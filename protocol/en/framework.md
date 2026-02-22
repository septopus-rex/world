# SPP Architecture Framework Protocol

The **String Particle Protocol (SPP)** conceptualizes a robust, extensible 3D virtual environment. This framework protocol outlines the core architectural principles, coordinate systems, and data pipelines required to implement an SPP-compliant engine.

## 1. Global Coordinate Systems

SPP strictly defines multiple interconnected coordinate systems to manage data efficiency and rendering logic. A key distinction in SPP is that the **Z-axis represents the vertical (up/down) direction** (where the player stands), which differs from default Three.js coordinates.

| System | SPP Notation | Primary Function |
|---|---|---|
| **Block Coordinates** | `A` System | Local coordinates relative to a single Block's origin. Used for highly compressed, repeatable storage of Adjuncts on a single piece of land. |
| **World Coordinates** | `B` System | Global absolute coordinates. Used for stitching multiple Blocks together and determining dynamic loading (frustum culling) regions. |
| **Screen Coordinates** | `C` System | 2D viewport projections. Used for processing user inputs (mouse clicks, touch events) and rendering 2D minimaps. |

## 2. Operating Modes

An SPP engine must confidently switch between different predefined environmental states, restricting or enabling player interactions as needed.

| Mode | State Description | Interactive Capabilities |
|---|---|---|
| **Normal (Browse)** | Default world exploration for registered avatars. | Full movement, interaction with active triggers and objects. |
| **Ghost (Spectator)** | Anonymous or low-privilege exploration. | Free-roam collisionless movement; zero interaction capability. |
| **Edit** | Real-time world building. | Modifies single Block data; pauses active global simulation. |
| **Game** | Locked narrative or interactive simulation. | Focuses rendering strictly on involved Blocks; restricts player from leaving the designated simulation boundaries. |

## 3. Data Flow & Representation States

To decouple the storage layer (Blockchain/IPFS) from the rendering frontend (React/Three.js), SPP mandates distinct transitional data states.

| Data State | Identifier | Characteristic Purpose |
|---|---|---|
| **Raw Data** | `raw` | The ultimate source of truth. Highly compressed numeric strings stored on-chain or off-chain (IPFS). Designed for cheap bandwidth and storage. |
| **Standard Data** | `std` | The parsed, human-readable JS Object representation of the `raw` data. Serves as the universal intermediate format within the engine's memory. |
| **Render Data** | `3d` / `2d` / `active` | The final conversion of `std` into engine-specific formats (e.g., Three.js `Mesh` parameters, or SVG/Canvas coordinates for UI minimaps). |

## 4. Blockchain Environmental Sync

SPP environments can dynamically bind their atmospheric and temporal conditions directly to the heartbeat of the host blockchain.

- **Time System**: In-world time (affecting day/night cycles, or aging mechanics) is calculated deterministically from the **Blockchain's Current Block Height**.
- **Weather System**: In-world weather (rain, fog, storms) is generated procedurally using the **Blockchain's Block Hash** as the randomization seed.

## 5. Engine Architecture & Frame Sync

To guarantee smooth 3D performance (maintaining 60FPS), an SPP Engine employs a strict **Frame Synchronization (Tick)** architecture.

- **Asynchronous Decoupling**: Heavy tasks such as IPFS network fetches or parsing large 3D model `.glb` files are pushed to an asynchronous queue.
- **Micro-tasking**: The main render loop (`tick`) consumes a limited slice of tasks from the queue per frame. This ensures the main 3D rendering thread is never blocked for more than 16ms, preventing UI freezing during large data loads.
