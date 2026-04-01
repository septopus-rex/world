import { RenderHandle } from '../types/Adjunct';

export type EffectType = "explosion" | "sparks" | "smoke" | "heals";

/**
 * Attaches a temporary visual particle effect to an Entity.
 */
export interface EffectComponent {
    type: EffectType;
    duration: number;
    elapsed: number;
    particleCount: number;
    points?: RenderHandle;
    velocities?: Float32Array;
}
