/**
 * Engine Core Technical Constants
 * These define the "laws of physics" and technical baselines for the world.
 */

export const ENGINE_CONSTANTS = {
    BLOCK_SIZE: 16,
    GRAVITY: -9.81 * 2, // Doubled for game feel
    TICK_RATE: 0.1,    // 10Hz for grid/state sync
    DEFAULT_EXTEND: 2, // 5x5 block loading radius
};

export const PHYSICS_CONSTANTS = {
    EPSILON: 0.05,
    MARGIN: 0.01,
};

export const CONTROL_CONSTANTS = {
    MOUSE_SENSITIVITY: 0.005,
    TOUCH_SENSITIVITY: 0.005,
    TURN_SPEED: 2.0,
    DEADZONE: 0.1,
};

export const RENDER_CONSTANTS = {
    FOV: 45,
    NEAR: 0.1,
    FAR: 5000,
    ENVIRONMENT_LIGHT_COLOR: 0xffffff,
    GROUND_LIGHT_COLOR: 0x444444,
    MINIMAP_FRUSTUM: 120,
    MINIMAP_NEAR: 0.1,
    MINIMAP_FAR: 2000,
};
