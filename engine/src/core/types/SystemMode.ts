export enum SystemMode {
    /**
     * Normal exploration mode.
     * Player can move freely, camera is linked to player gaze.
     */
    Normal = 'normal',

    /**
     * Edit mode.
     * Used for modifying world content, adjuncts, etc.
     * Inputs may be redirected to editing tasks (e.g. moving objects).
     */
    Edit = 'edit',

    /**
     * Game mode.
     * Full gameplay state. Block content is pre-loaded, gameplay logic is active.
     */
    Game = 'game',

    /**
     * Read-only mode for visitors.
     */
    Ghost = 'ghost',

    /**
     * Observe mode.
     * Player control is suspended; the camera orbits a target (the player /
     * current block) — drag to rotate, W/S to zoom. For inspecting a build from
     * the outside (the standalone successor to the old "observe" renderer).
     */
    Observe = 'observe'
}
