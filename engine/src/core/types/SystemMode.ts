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

/**
 * How a game session ENDS when the player leaves the game's block — declared
 * per-game (carried by the game trigger's `enterGame` action), NOT a second
 * SystemMode (gameplay gating keys off SystemMode.Game identically for all three).
 * See docs/systems/game-mode-entry.md §2.
 *
 *  - 'ephemeral'  : walk off the block → silent exit + tear the round down. The
 *                   arcade-cabinet default (gachapon, shooting range, casual).
 *  - 'confirm'    : walk off → keep the round alive + emit `game.leave_intent`
 *                   so the interpreter can ask "leave game?"; the round survives
 *                   until the player confirms (exitGame) or the block evicts.
 *  - 'persistent' : (not yet) save the session, resume on re-entry; needs the
 *                   region preload/no-evict path. Treated as 'ephemeral' for now.
 */
export type GameExitPolicy = 'ephemeral' | 'confirm' | 'persistent';

/** Narrow an untrusted value (e.g. a trigger param) to a GameExitPolicy. */
export function asExitPolicy(v: unknown): GameExitPolicy {
    return v === 'confirm' || v === 'persistent' ? v : 'ephemeral';
}
