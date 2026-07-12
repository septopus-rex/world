import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';

/**
 * Point-cloud particle effects (render/ParticleFX) — the weather sheet
 * (rain/snow volume following the player) and one-shot radial bursts
 * (item pickups etc.). Owns only geometry/material construction and
 * per-frame position integration; lifetime/visibility policy stays with
 * the driving systems (EnvironmentSystem / ParticleEffectSystem), and
 * disposal goes through the facade's removeHandle like any other handle.
 */
export class ParticleFX {
    /** All particles live under worldRoot so the floating origin applies. */
    constructor(private readonly worldRoot: THREE.Group) { }

    /** Ambient weather volume (2000 points in a 50×40×50 box, hidden until driven). */
    public createWeather(): RenderHandle {
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            vertices[i * 3 + 0] = Math.random() * 50;
            vertices[i * 3 + 1] = Math.random() * 40;
            vertices[i * 3 + 2] = Math.random() * 50;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({
            color: 0x88CCFF,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
        });

        const points = new THREE.Points(geometry, material);
        points.visible = false;
        this.worldRoot.add(points);
        return points;
    }

    /** Re-centre the weather volume on the player and toggle visibility. */
    public updateWeather(points: RenderHandle, x: number, y: number, z: number, visible: boolean): void {
        const p = points as THREE.Points;
        p.position.set(x - 25, y - 20, z - 25);
        p.visible = visible;
    }

    /** One-shot radial burst: velocities are returned for the caller to integrate. */
    public createBurst(particleCount: number, color: number): { handle: RenderHandle, velocities: Float32Array } {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = Math.random() * 15 + 5;
            velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.cos(phi) + 5;
            velocities[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.2,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.worldRoot.add(points);

        return { handle: points, velocities };
    }

    /** Integrate one burst frame: ballistic positions + caller-driven fade. */
    public updateBurst(handle: RenderHandle, dt: number, velocities: Float32Array, opacity: number): void {
        const points = handle as THREE.Points;
        const positions = points.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < velocities.length / 3; i++) {
            positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
            positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
            positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            velocities[i * 3 + 1] -= 9.8 * dt; // Gravity
        }

        points.geometry.attributes.position.needsUpdate = true;
        (points.material as THREE.PointsMaterial).opacity = opacity;
    }
}
