# Septopus Engine Architecture Framework Protocol

The **Septopus Engine** is a 3D content execution environment built upon a foundation of **Adjuncts**. The engine's core logic handles the lifecycle, rendering, and interaction of these adjuncts, while abstract organization of content is managed by upper-level protocols.

The **String Particle Protocol (SPP)** is a semantic spatial organization protocol. It collapses complex adjunct combinations into a "string" description, enabling AI-native 3D generation and rapid distribution. Within the Septopus Engine, SPP logic is encapsulated within a special **`spp` Meta-Adjunct**, which acts as an announcer to resolve and restore complex spatial structures.

This framework protocol outlines the core architectural principles, coordinate systems, and the application of SPP within the engine's data pipeline.

## 1. Global Coordinate Systems

SPP strictly defines multiple interconnected coordinate systems to manage data efficiency and rendering logic. A key distinction in SPP is that the **Z-axis represents the vertical (up/down) direction** (where the player stands), which differs from default Three.js coordinates.

| System | SPP Notation | Primary Function |
|---|---|---|
| **Block Coordinates** | `A` System | Local coordinates relative to a single Block's origin. Used for highly compressed, repeatable storage of Adjuncts on a single piece of land. |
| **World Coordinates** | `B` System | Global absolute coordinates. Used for stitching multiple Blocks together and determining dynamic loading (frustum culling) regions. |
| **Screen Coordinates** | `C` System | 2D viewport projections. Used for processing user inputs (mouse clicks, touch events) and rendering 2D minimaps. |

## 2. Operating Modes

The engine must reliably switch between predefined environmental states. SPP provides the data organizational boundaries for these transitions.

### 2.1 Mode Definition Table

| Mode | State Description | Interactive Capabilities & Restrictions |
|---|---|---|
| **Normal (Browse)** | Default world exploration for registered avatars. | Full movement, interaction with active triggers and objects. |
| **Edit** | **Exclusive** real-time world building. | Enables the **"Exclusive Session Rules"** below, allowing modification of single Block data. |
| **Game** | Locked narrative or interactive simulation. | Focuses rendering strictly on involved Blocks; restricts player from leaving the designated simulation boundaries. |

### 2.2 Exclusive Session Rules (Edit Mode)

To ensure data integrity and protocol consistency, Edit Mode must adhere to the following mandatory rules:

1.  **Session Locking**: Upon entering Edit Mode, the engine must detect and lock a unique `activeBlockId` based on the player's position. This ID remains fixed throughout the session and does not change as the player moves.
2.  **Interaction Isolation**: The engine must perform ownership validation on all raycasts. Only Adjuncts belonging to the currently active Block are allowed to be selected, moved, or modified. Clicks on non-target blocks are ignored or trigger a "deselect current" action.
3.  **Alignment Protocol**: All offset calculations during editing must strictly follow 1-based coordinate math, ensuring all visual aids (such as highlight fences) are physically aligned with the block's ground tiles.

## 3. Data Flow & Representation States

To decouple high-dimensional content organization from low-dimensional execution, the system divides data into two phases: **"Pseudo-existence"** and **"Physical existence."**

### 3.1 Core Data Definitions

| Identifier | Meaning | Physical Form |
|---|---|---|
| **SPP_IPFS_A** | **String Particle Genome** | Global full-state protocol definition stored on IPFS, containing all Face Options and connection rules. It is a full-state semantic language system. |
| **SPP_DATA** | **Collapsed Instance Blueprint** | Specific spatial matrix data stored within an `spp` adjunct. It records the deterministic collapsed state of string particles within a local region. |

### 3.2 Data Transformation Pipeline (The Announcer Model)

1.  **Collapse & Storage**: AI or developers use the SPP protocol to collapse 3D content into a compact `SPP_DATA` representation for persistence.
2.  **Location & Mounting**: An **`spp` adjunct** is deployed into a designated spatial slot within a Block, and the `SPP_DATA` is injected into it.
3.  **Resolution & Instantiation (Unfold)**: The `spp` adjunct acts as an "announcer," applying the rules of the full **`SPP_IPFS_A`** genome to the specific **`SPP_DATA`** blueprint to resolve a list of **other adjuncts** that should exist locally.
4.  **Display**: The resolved adjunct list is handed over to the engine's rendering pipeline. The final 3D display seen by the user is composed of these derived adjunct entities.

## 4. Blockchain Environmental Sync

Septopus-driven environments can dynamically bind their atmospheric and temporal conditions directly to the heartbeat of the host blockchain.

- **Time System**: In-world time (affecting day/night cycles, or aging mechanics) is calculated deterministically from the **Blockchain's Current Block Height**.
- **Weather System**: In-world weather (rain, fog, storms) is generated procedurally using the **Blockchain's Block Hash** as the randomization seed.

## 5. Engine Architecture & Frame Sync

To guarantee smooth 3D performance (maintaining 60FPS), a Septopus Engine employs a strict **Frame Synchronization (Tick)** architecture.

- **Asynchronous Decoupling**: Heavy tasks such as IPFS network fetches or parsing large 3D model `.glb` files are pushed to an asynchronous queue.
- **Micro-tasking**: The main render loop (`tick`) consumes a limited slice of tasks from the queue per frame. This ensures the main 3D rendering thread is never blocked for more than 16ms, preventing UI freezing during large data loads.
