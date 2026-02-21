import * as THREE from 'three';
import { EntityId } from '../World';

export type EffectType = "explosion" | "sparks" | "smoke" | "heals";

/**
 * Attaches a temporary visual particle effect to an Entity.
 * Can be a standalone entity that destroys itself, or attached to a moving player.
 */
export interface EffectComponent {
    type: EffectType;

    // Lifespan of the effect
    duration: number;
    elapsed: number;

    // Active particles Data
    particleCount: number;
    geometry?: THREE.BufferGeometry;
    material?: THREE.PointsMaterial | THREE.ShaderMaterial;
    points?: THREE.Points;

    // Movement Physics array for each particle
    velocities?: Float32Array;
}
