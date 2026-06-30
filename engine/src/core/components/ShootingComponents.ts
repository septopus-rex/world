/**
 * Shooting-range (3D in-world target practice) ECS components.
 *
 * The third native-game shape after pool (continuous physics) and mahjong
 * (discrete, turn-based): the SHOT-and-REACT loop. The ShootingRangeSystem owns
 * the score/timer; targets ARE a7 sphere adjunct entities. Its reason to exist is
 * the one gap pool + mahjong both dodged — RUNTIME RECOLOUR: a hit flips a target
 * red in place (via the appearance-override channel), then it rearms to green.
 * That's why a target's colour is logical STATE here, not baked geometry.
 */

export type ShootingTargetState = 'up' | 'hit';

/** A single target's authoritative state (the sphere entity carries this). */
export interface ShootingTargetComponent {
    targetId: number;             // stable 0..n-1 (snapshot/HUD/tests address by this)
    state: ShootingTargetState;   // 'up' = live/green, 'hit' = scored/red, rearming
    litTimer: number;             // seconds left in the red flash before it pops back up
    upColor: number;              // live colour
    hitColor: number;             // hit-flash colour
}

/** The range itself: score + round timer (one per ShootingRangeSystem instance). */
export interface ShootingRangeComponent {
    block: [number, number];      // which block the range sits on
    phase: 'running' | 'over';
    timeLeft: number;             // round seconds remaining
    duration: number;             // round length (for the HUD)
    score: number;                // = hits (one point each); kept separate for future scoring
    shots: number;                // every trigger pull (hit or miss) → accuracy
    hits: number;
    targetCount: number;
    litTime: number;              // how long a hit target stays red before rearming
}
