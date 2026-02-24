# Septopus Player Protocol

Within the **Septopus Engine**, the "Player" is not just a viewpoint, but an interactive unit that follows physical rules and has a visual representation (Avatar) within the world. Their position and state are tracked in real-time by the engine and can deeply interact with content organized via SPP.

## 1. Player Spatial State

Unlike static blocks, the Player's state is hyper-dynamic. The Septopus engine must continuously track the player's world positioning and posture to calculate physics and rendering bounds.

A Player's core persistent state format:
```json
{
    "block": [2025, 501],         
    "world": 0,                   
    "position": [8, 14, 0],       
    "rotation": [0, 0, 0],       
    "stop": {
        "on": false,               
        "adjunct": "",            
        "index": 0                
    },
    "extend": 2,                  
    "posture": 0                  
}
```

### State Properties
*   `block`: The `[X, Y]` coordinates of the Block the player currently occupies.
*   `world`: The ID of the current Septopus virtual world.
*   `position`: The `[X, Y, Z]` precise coordinates *relative to the current Block*.
*   `rotation`: The Euler Euler rotation array `[X, Y, Z]` of the player's viewing angle.
*   `stop`: Defines vertical collision grounding. If the player is standing on an elevated object (an Adjunct like a bridge or table), the engine must know which object to calculate absolute falling equations correctly.
*   `extend`: The viewport loading radius. Defines how many neighboring blocks (in a grid) to load around the player.
*   `posture`: Integer representing movement state (e.g., `0`: Standing, `1`: Walking, `2`: Running, `3`: Climbing, `4`: Squatting, `5`: Lying/Prone).

## 2. Terrain & Gravity Calculations

The engine dynamically calculates the absolute height (Z-axis floor) under the player to prevent falling through the world.

`Absolute Floor Z = Base Block Elevation + Interacting 'Stop' Adjunct Elevation + Object Height`

### Movement Boundary Checks
When the player attempts to move laterally, the physics system must evaluate height differentials using the following logic:
1.  **Block $\rightarrow$ Adjunct**: The player steps towards an object. If the object height is within "step height", it's a "Step Up." If it's too high, it's a "Blocked Collision."
2.  **Adjunct $\rightarrow$ Adjunct**: The player walks between two objects. Can result in "Step Up," "Blocked Collision," "Step Down," or a "Lethal Fall."
3.  **Adjunct $\rightarrow$ Block**: The player steps off an object onto the bare ground. Results in "Step Down" or "Lethal Fall."

## 3. Avatars (虚拟形象)

Players can broadcast their visual representation to others using Avatar files. To remain decentralized, Avatars are stored on IPFS.

### Avatar Metadata Structure
When a player equips an Avatar, the client provides the following profile so the engine can calculate accurate hitboxes and animations.

```json
{
    "body": {
        "scale": [1, 1, 1] 
    },
    "action": [],
    "emotion": [],
    "datasource": "ipfs://Qm...",  
    "format": "vrm"           
}
```

### Avatar Animations & Emotes
The Avatar model must contain, at a minimum, the following standard animation skeletons bound to the `posture` state:
- **Movement Skeletons**: `Stand`, `Walk`, `Run`, `Squat`, `Prone`, `Climb`.
- **Emote Blendshapes (Facial)**: `Normal`, `Happy`, `Angry`, `Sad` (Each with 8 supported intensity gradients).
