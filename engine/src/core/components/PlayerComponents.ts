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
// 3b. Player Body / Capacity parameters (movement + collision tuning)
// -----------------------------------------------------------------------------
export interface PlayerBodyComponent {
    /** Total body height (m) — collision column height. */
    height: number;
    /** Camera eye height above feet (m). */
    eyeHeight: number;
    /**
     * Max auto step-up / cross height (m). The single threshold for
     * "step over" (climb onto obstacles <= stepHeight) vs "block" (taller).
     */
    stepHeight: number;
    /** Crouch height (m). Reserved. */
    crouchHeight: number;
    /** Target jump apex (m). Reserved (jumpForce drives the impulse for now). */
    jumpHeight: number;
    /** Fall distance (m) that emits a "player:fell" event. */
    fallDeathHeight: number;
}

// -----------------------------------------------------------------------------
// 4. Static Collision Boundaries (e.g. Walls, Floors)
// -----------------------------------------------------------------------------
export interface SolidComponent {
    /** box = AABB (rotation ignored) · cylinder = vertical round pillar (radius =
     *  size[0]/2, rotation-invariant) · slope = wedge ramp rising toward local
     *  north, honoring the entity's vertical-axis rotation (TransformComponent
     *  rotation[1] — engine yaw). Resolved by MovementCollider; PhysicsSystem
     *  (non-player bodies) still approximates every shape as its AABB. */
    shape: "box" | "cylinder" | "slope";
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
    /** Optional model resource id (IPFS CID / path) loaded via ResourceManager. */
    resource?: string;
    /** SCALED Y of the model's bounding-box bottom relative to its origin
     *  (= bounds.min.y * scale). The controller plants the avatar at
     *  feetY − footOffset so its feet sit on the ground regardless of where the
     *  GLTF's pivot is. Undefined for the centred box placeholder (placed at the
     *  body centre, as before). */
    footOffset?: number;
    /** Per-model yaw correction (radians) that aligns the GLTF's authored
     *  forward with Septopus north — external models disagree on which way is
     *  "front" (+Z vs −Z). The controller applies playerYaw + facing. Default
     *  Math.PI (the legacy avatar's convention). See protocol avatar-animation.md. */
    facing?: number;
}
