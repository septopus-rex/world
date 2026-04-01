import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { EffectComponent } from '../components/EffectComponent';

export class ParticleEffectSystem implements ISystem {
    private world!: World;

    public attach(world: World): void {
        this.world = world;
        this.world.on("spawn_effect", this.onSpawnEffect.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);

        const effectEntities = world.getEntitiesWith(["EffectComponent", "TransformComponent"]);

        for (const id of effectEntities) {
            const effect = world.getComponent<EffectComponent>(id, "EffectComponent")!;
            effect.elapsed += dt;

            if (effect.points && effect.velocities) {
                const lifeRatio = 1.0 - (effect.elapsed / effect.duration);
                const opacity = Math.max(0, lifeRatio);

                world.renderEngine.updateParticleBurst(effect.points, dt, effect.velocities, opacity);
            }

            if (effect.elapsed >= effect.duration) {
                if (effect.points) world.renderEngine.removeHandle(effect.points);
                world.destroyEntity(id);
            }
        }
    }

    private onSpawnEffect(event: any): void {
        const { position, type } = event;
        const effectEntity = this.world.createEntity();

        this.world.addComponent(effectEntity, "TransformComponent", {
            position: position || [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        const color = type === "sparks" ? 0xffff00 : type === "heals" ? 0x00ff00 : 0xff5500;
        const particleCount = 100;

        const { handle, velocities } = this.world.renderEngine.createParticleBurst(particleCount, color);
        // Set initial position
        this.world.renderEngine.setObjectPosition(handle, position[0], position[1], position[2]);

        this.world.addComponent(effectEntity, "EffectComponent", {
            type: type || "explosion",
            duration: 1.5,
            elapsed: 0,
            particleCount,
            points: handle,
            velocities
        });
    }
}
