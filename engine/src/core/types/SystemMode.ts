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
    Ghost = 'ghost'
}
