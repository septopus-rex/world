/**
 * HealthComponent — gameplay vitals for the player (and future NPCs).
 * Mutated only through HealthSystem's events (player:damage / player:heal),
 * which trigger actions reach via the actuator's Game-mode-gated 'player' type.
 */
export interface HealthComponent {
    hp: number;
    maxHp: number;
}
