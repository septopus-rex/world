import * as THREE from 'three';
import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { EffectComponent } from '../components/EffectComponent';

export class ParticleEffectSystem implements ISystem {
    private world!: World;

    public attach(world: World): void {
        this.world = world;

        // Listen for requests to spawn generic effects
        this.world.subscribe("spawn_effect", this.onSpawnEffect.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);

        const effectEntities = world.getEntitiesWith(["EffectComponent", "TransformComponent"]);

        for (const id of effectEntities) {
            const effect = world.getComponent<EffectComponent>(id, "EffectComponent")!;
            const transform = world.getComponent<TransformComponent>(id, "TransformComponent")!;

            effect.elapsed += dt;

            // 1. Animate Particles first
            if (effect.geometry && effect.velocities) {
                const positions = effect.geometry.attributes.position.array as Float32Array;

                for (let i = 0; i < effect.particleCount; i++) {
                    // Update positions based on velocities
                    positions[i * 3 + 0] += effect.velocities[i * 3 + 0] * dt;
                    positions[i * 3 + 1] += effect.velocities[i * 3 + 1] * dt;
                    positions[i * 3 + 2] += effect.velocities[i * 3 + 2] * dt;

                    // Apply gravity
                    effect.velocities[i * 3 + 1] -= 9.8 * dt;
                }

                effect.geometry.attributes.position.needsUpdate = true;

                // Fade out effect
                if (effect.material && effect.material instanceof THREE.PointsMaterial) {
                    const lifeRatio = 1.0 - (effect.elapsed / effect.duration);
                    effect.material.opacity = Math.max(0, lifeRatio);
                }
            }

            // 2. Check if effect has expired
            if (effect.elapsed >= effect.duration) {
                // Cleanup Three.js memory
                if (effect.geometry) effect.geometry.dispose();
                if (effect.material) effect.material.dispose();
                if (effect.points) world.scene.remove(effect.points);

                // Destroy the entity if it was a standalone effect
                world.destroyEntity(id);
            }
        }
    }

    private onSpawnEffect(event: GameEvent): void {
        const { position, type } = event.payload;

        const effectEntity = this.world.createEntity();

        // Base Transform
        this.world.addComponent(effectEntity, "TransformComponent", {
            position: position || [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        // Effect Component initialized empty
        const effectComp: EffectComponent = {
            type: type || "explosion",
            duration: 1.5,
            elapsed: 0,
            particleCount: 100
        };

        // Initialize Three.js structures based on effect type
        this.buildEffectGeometry(effectComp, position);

        this.world.addComponent(effectEntity, "EffectComponent", effectComp);
    }

    private buildEffectGeometry(effect: EffectComponent, center: [number, number, number]) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(effect.particleCount * 3);
        const velocities = new Float32Array(effect.particleCount * 3);

        const color = effect.type === "sparks" ? 0xffff00 :
            effect.type === "heals" ? 0x00ff00 : 0xff5500;

        for (let i = 0; i < effect.particleCount; i++) {
            // Start at center
            positions[i * 3 + 0] = center[0];
            positions[i * 3 + 1] = center[1];
            positions[i * 3 + 2] = center[2];

            // Random spherical burst velocity
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = Math.random() * 15 + 5;

            velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.cos(phi) + 5; // Upward bias
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

        // Add to the actual Three world scene 
        this.world.scene.add(points);

        effect.geometry = geometry;
        effect.material = material;
        effect.points = points;
        effect.velocities = velocities;
    }
}
