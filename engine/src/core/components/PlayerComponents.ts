import { EntityId } from '../World';

// -----------------------------------------------------------------------------
// 1. Core Transform (Shared by almost everything)
// -----------------------------------------------------------------------------
export interface TransformComponent {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    /** Dirty flag — set to true when position/rotation/scale changes. VisualSyncSystem resets it after syncing. */
    dirty?: boolean;
}

// -----------------------------------------------------------------------------
// 2. Player Input Status
// -----------------------------------------------------------------------------
export interface InputStateComponent {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    run: boolean;

    // Abstracted interaction intentions (E key, left mouse click, etc.)
    interactPrimary: boolean;
    interactSecondary: boolean;

    // View intent keys (for overriding mouse look with keyboard)
    lookUp: boolean;
    lookDown: boolean;
    lookLeft: boolean;
    lookRight: boolean;
    modifierAlt: boolean;

    // Movement Intent vector calculated this frame (relative local space)
    movementIntent: [number, number, number];

    // Looking Intent (Pitch & Yaw changes requested by mouse)
    lookYawDelta: number;
    lookPitchDelta: number;

    // Mouse Screen Position for picking (-1 to 1)
    mouseNDC: [number, number];
}

// -----------------------------------------------------------------------------
// 3. Physics & Movement
// -----------------------------------------------------------------------------
export interface RigidBodyComponent {
    // AABB Bounds (width, height, depth) relative to position
    size: [number, number, number];
    offset: [number, number, number];

    // Core physics vectors
    velocity: [number, number, number];

    // Tuning parameters
    mass: number;
    maxSpeedWalk: number;
    maxSpeedRun: number;
    jumpForce: number;
    gravity: number;
    friction: number;

    // State Tracking
    isGrounded: boolean;
}

// -----------------------------------------------------------------------------
// 4. Static Collision Boundaries (e.g. Walls, Floors)
// -----------------------------------------------------------------------------
export interface SolidComponent {
    shape: "box" | "sphere" | "capsule";
    size: [number, number, number];
    offset: [number, number, number];
}

// -----------------------------------------------------------------------------
// 5. Camera Attachment
// -----------------------------------------------------------------------------
export interface CameraComponent {
    // If an entity has this, the World's 3D camera should attach to its Transform.
    offset: [number, number, number]; // Eye height
    fov: number;
    active: boolean;                  // is this the currently rendering camera?
}
// -----------------------------------------------------------------------------
// 6. Visual Avatar (Third-person view or shadow)
// -----------------------------------------------------------------------------
export interface AvatarComponent {
    handle: any;
    visible: boolean;
}
