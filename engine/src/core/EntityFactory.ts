import { World, EntityId } from './World';
import { TransformComponent, RigidBodyComponent, CameraComponent, InputStateComponent, AvatarComponent, PlayerBodyComponent } from './components/PlayerComponents';
import { InventoryComponent } from './components/InventoryComponent';
import { HealthComponent } from './components/HealthComponent';
import { CharacterController } from './movement/CharacterController';

/**
 * EntityFactory: Centralized assembler for complex entities.
 * Extracted from World.ts to keep the core orchestrator clean.
 */
export class EntityFactory {
    public static setupPlayer(world: World, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): EntityId {
        const player = world.createEntity();

        world.addComponent<TransformComponent>(player, "TransformComponent", {
            position: [...position],
            rotation: [...rotation],
            scale: [1, 1, 1]
        });

        world.addComponent<RigidBodyComponent>(player, "RigidBodyComponent", {
            size: [0.6, 1.8, 0.6],
            offset: [0, 0, 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: 5,
            maxSpeedRun: 10,
            jumpForce: 8,
            gravity: 1,
            friction: 0.9,
            isGrounded: false
        });

        world.addComponent<InputStateComponent>(player, "InputStateComponent", {
            forward: false, backward: false, left: false, right: false, jump: false, run: false,
            interactPrimary: false, interactSecondary: false,
            lookUp: false, lookDown: false, lookLeft: false, lookRight: false,
            movementIntent: [0, 0, 0],
            lookPitchDelta: 0, lookYawDelta: 0,
            mouseNDC: [0, 0],
            modifierAlt: false
        });

        world.addComponent<CameraComponent>(player, "CameraComponent", {
            offset: [0, 1.7, 0],
            fov: 75,
            active: true
        });

        world.addComponent<PlayerBodyComponent>(player, "PlayerBodyComponent", {
            height: 1.8,
            eyeHeight: 1.7,
            stepHeight: 0.5,
            crouchHeight: 0.9,
            jumpHeight: 1.2,
            fallDeathHeight: 12
        });

        // The pickup chain (interact → pickup_item → InventorySystem) credits
        // items to the actor's inventory — without this the chain dead-ends.
        world.addComponent<InventoryComponent>(player, "InventoryComponent", {
            items: [],
            // King's config caps the bag (WorldConfig.player.bag.max).
            maxCapacity: (world.config.player as any)?.bag?.max ?? 30
        });

        world.addComponent<HealthComponent>(player, "HealthComponent", {
            hp: 100,
            maxHp: 100
        });

        const avatarHandle = world.renderEngine.createAvatarMesh();
        world.renderEngine.setObjectPosition(avatarHandle, position[0], position[1], position[2]);

        const avatarRes = (world.config.player as any)?.avatar?.resource;
        world.addComponent<AvatarComponent>(player, "AvatarComponent", {
            handle: avatarHandle,
            visible: true,
            resource: avatarRes != null ? String(avatarRes) : undefined
        });

        // The avatar is just a model resource (IPFS-fetchable) — reuse the model
        // pipeline: show the placeholder box now, swap in the loaded model when it
        // resolves (load-once-by-id, dedup-ready for future multiplayer).
        if (avatarRes != null) {
            EntityFactory.loadAvatarModel(world, player, String(avatarRes), avatarHandle, 1.8);
        }

        // Initial Camera Sync
        world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
        world.renderEngine.setMainCameraPosition(position[0], position[1] + 1.7, position[2]);

        // Attach Controls
        const controller = world.systems.findSystem(CharacterController);
        if (controller) {
            controller.attachToEntity(player);
        }

        return player;
    }

    /**
     * Load the avatar model for `resourceId` via ResourceManager (load-once-by-id,
     * IPFS-CID-capable through resolveUrl) and swap it in for the placeholder box:
     * scale uniformly so its height matches the player body, add it to the scene
     * (CharacterController positions/rotates it each frame). Eviction-safe: keeps
     * the placeholder if the load fails.
     */
    private static loadAvatarModel(world: World, player: EntityId, resourceId: string, placeholder: any, bodyHeight: number): void {
        const rm = (world as any).resourceManager;
        if (!rm?.getModel) return;
        rm.getModel(resourceId).then((entry: any) => {
            const av = world.getComponent<AvatarComponent>(player, "AvatarComponent");
            if (!av) return;
            const model = rm.instance(resourceId);

            // Uniform scale-to-body (preserve aspect). Guard against a degenerate
            // bound (e.g. empty Box3) so the avatar never scales to 0 / NaN.
            const h = entry.bounds.max.y - entry.bounds.min.y;
            const k = Number.isFinite(h) && h > 1e-4 ? bodyHeight / h : 1;
            model.scale.set(k, k, k);

            // Skinned avatars near the camera: disable frustum culling — a cloned/
            // scaled SkinnedMesh keeps a stale bind-pose bounding sphere and three
            // would wrongly cull it (invisible). Cheap for a single avatar.
            model.traverse?.((o: any) => { if (o.isMesh) o.frustumCulled = false; });

            // Place it at the player immediately (the per-frame sync would otherwise
            // leave it at world origin for one frame).
            const t = world.getComponent<any>(player, "TransformComponent");
            if (t) model.position?.set?.(t.position[0], t.position[1], t.position[2]);

            world.renderEngine.add(model);          // into the scene; posed each frame by the controller
            world.renderEngine.removeHandle(placeholder);
            av.handle = model;

            // Wire skeletal animation via the render layer (keeps core Three.js-free).
            // Clips come from the entry (real AnimationClip instances) — clone
            // userData is JSON-mangled by Object3D.copy and must not be trusted.
            const clips: any[] = entry.animations ?? model.userData?.animations ?? [];
            if (clips.length > 0) {
                (world.renderEngine as any).startAnimation(model, clips);
            }

            let meshes = 0; model.traverse?.((o: any) => { if (o.isMesh) meshes++; });
            console.log(`[Avatar] loaded ${resourceId}: meshes=${meshes} clips=${clips.length} bodyH=${bodyHeight} srcH=${h?.toFixed?.(2)} scale=${k.toFixed(3)} at`, t?.position);
        }).catch((err: any) => {
            console.warn(`[Avatar] model ${resourceId} load FAILED; keeping placeholder box.`, err?.message ?? err);
        });
    }
}
