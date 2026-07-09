import { World, EntityId } from './World';
import { reportError, ResourceError } from './errors';
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

        // Movement capacity comes from the king's config (player.capacity) — the
        // engine values below are only fallbacks for absent fields. `speed` is the
        // RUN baseline (walkSpeed is its own optional field). This is where the
        // previously-dead capacity config actually lands on the rigid body.
        const cap = (world.config.player as any)?.capacity ?? {};
        // Physique baseline is DATA (player.physique, D9): avatars scale to its
        // height, the camera rides its eyeHeight — engine values are defaults.
        const phy = (world.config.player as any)?.physique ?? {};
        const bodyHeight = Number(phy.height) || 1.8;
        const eyeHeight = Number(phy.eyeHeight) || 1.7;
        world.addComponent<RigidBodyComponent>(player, "RigidBodyComponent", {
            size: [0.6, bodyHeight, 0.6],
            offset: [0, 0, 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: cap.walkSpeed ?? 5,
            maxSpeedRun: cap.speed ?? 10,
            jumpForce: cap.jumpForce ?? 8,
            gravity: cap.gravityMultiplier ?? 1,
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
            offset: [0, eyeHeight, 0],
            fov: 75,
            active: true
        });

        world.addComponent<PlayerBodyComponent>(player, "PlayerBodyComponent", {
            height: bodyHeight,
            eyeHeight,
            stepHeight: Number(phy.stepHeight) || 0.5,
            crouchHeight: Number(phy.crouchHeight) || 0.9,
            jumpHeight: Number(phy.jumpHeight) || 1.2,
            fallDeathHeight: Number(phy.fallDeathHeight) || 12
        });

        // The pickup chain (interact → pickup_item → InventorySystem) credits
        // items to the actor's inventory — without this the chain dead-ends.
        world.addComponent<InventoryComponent>(player, "InventoryComponent", {
            items: [],
            // King's config caps the bag (WorldConfig.player.bag.max).
            maxCapacity: (world.config.player as any)?.bag?.max ?? 30
        });

        // Config-first like bag.max above; protocol default 100 (player.md §HP).
        const maxHp = Number((world.config.player as any)?.capacity?.maxHp) || 100;
        world.addComponent<HealthComponent>(player, "HealthComponent", {
            hp: maxHp,
            maxHp
        });

        const avatarHandle = world.renderEngine.createAvatarMesh();
        world.renderEngine.setObjectPosition(avatarHandle, position[0], position[1], position[2]);

        const avatarCfg = (world.config.player as any)?.avatar ?? {};
        const avatarRes = avatarCfg.resource;
        world.addComponent<AvatarComponent>(player, "AvatarComponent", {
            handle: avatarHandle,
            visible: true,
            resource: avatarRes != null ? String(avatarRes) : undefined,
            facing: typeof avatarCfg.facing === 'number' ? avatarCfg.facing : undefined,
        });

        // The avatar is just a model resource (IPFS-fetchable) — reuse the model
        // pipeline: show the placeholder box now, swap in the loaded model when it
        // resolves (load-once-by-id, dedup-ready for future multiplayer).
        if (avatarRes != null) {
            EntityFactory.loadAvatarModel(world, player, String(avatarRes), avatarHandle, bodyHeight);
        }

        // Initial Camera Sync
        world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
        world.renderEngine.setMainCameraPosition(position[0], position[1] + eyeHeight, position[2]);

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
    /**
     * Swap the player's avatar at runtime (the frontend picker seam). Reuses the
     * exact load path: the CURRENT handle plays the "placeholder" role — removed
     * only when the new model lands, kept on a failed load. The old model's
     * ResourceManager refcount is released after a successful swap.
     */
    public static swapAvatar(world: World, resourceId: string, facing?: number): void {
        const players = world.queryEntities("AvatarComponent", "InputStateComponent");
        const player = players[0];
        if (player === undefined) return;
        const av = world.getComponent<AvatarComponent>(player, "AvatarComponent");
        if (!av || av.resource === resourceId) return;
        const releaseId = av.resource;      // refcount to drop once the swap lands
        av.resource = resourceId;
        if (typeof facing === 'number') av.facing = facing; // per-model orientation
        // Correct the new avatar TO the world's physique baseline (D9).
        const swapHeight = Number((world.config.player as any)?.physique?.height) || 1.8;
        EntityFactory.loadAvatarModel(world, player, resourceId, av.handle, swapHeight, releaseId);
    }

    private static loadAvatarModel(world: World, player: EntityId, resourceId: string, placeholder: any, bodyHeight: number, releaseResource?: string): void {
        const rm = (world as any).resourceManager;
        if (!rm?.getModel) return;
        rm.getModel(resourceId).then((entry: any) => {
            const av = world.getComponent<AvatarComponent>(player, "AvatarComponent");
            if (!av) return;
            // Stale-load guard: a newer swap may have set av.resource to a
            // different id while this load was in flight (boot-default vs restore
            // race, or rapid picker clicks). Drop this result so the LATEST
            // requested avatar always wins, never whichever model decodes last.
            if (av.resource !== resourceId) return;
            const model = rm.instance(resourceId);

            // Uniform scale-to-body (preserve aspect). Guard against a degenerate
            // bound (e.g. empty Box3) so the avatar never scales to 0 / NaN.
            const h = entry.bounds.max.y - entry.bounds.min.y;
            const k = Number.isFinite(h) && h > 1e-4 ? bodyHeight / h : 1;
            model.scale.set(k, k, k);

            // Plant the feet on the ground: a GLTF pivot is often at the model's
            // feet, so placing the origin at the body CENTRE (as the centred box
            // placeholder is) left the avatar floating ~half its height. Record the
            // scaled bbox-bottom so the controller can offset by it each frame.
            av.footOffset = (Number.isFinite(entry.bounds.min.y) ? entry.bounds.min.y : 0) * k;

            // Skinned avatars near the camera: disable frustum culling — a cloned/
            // scaled SkinnedMesh keeps a stale bind-pose bounding sphere and three
            // would wrongly cull it (invisible). Cheap for a single avatar.
            model.traverse?.((o: any) => { if (o.isMesh) o.frustumCulled = false; });

            // Place it at the player immediately (the per-frame sync would otherwise
            // leave it at world origin for one frame) — feet on the ground.
            const t = world.getComponent<TransformComponent>(player, "TransformComponent");
            const rb = world.getComponent<RigidBodyComponent>(player, "RigidBodyComponent");
            if (t) {
                const feetY = rb ? t.position[1] + rb.offset[1] - rb.size[1] / 2 : t.position[1];
                model.position?.set?.(t.position[0], feetY - (av.footOffset ?? 0), t.position[2]);
            }

            world.renderEngine.add(model);          // into the scene; posed each frame by the controller
            world.renderEngine.removeHandle(placeholder);   // also stops its mixer
            if (releaseResource != null) rm.release?.(releaseResource); // old avatar's instance refcount
            av.handle = model;
            av.visible = true;

            // Wire skeletal animation via the render layer (keeps core Three.js-free).
            // Clips come from the entry (real AnimationClip instances) — clone
            // userData is JSON-mangled by Object3D.copy and must not be trusted.
            const clips: any[] = entry.animations ?? model.userData?.animations ?? [];
            if (clips.length > 0) {
                (world.renderEngine as any).startAnimation(model, clips);
            }

            let meshes = 0; model.traverse?.((o: any) => { if (o.isMesh) meshes++; });
            console.log(`[Avatar] loaded ${resourceId}: meshes=${meshes} clips=${clips.length} bodyH=${bodyHeight} srcH=${h?.toFixed?.(2)} scale=${k.toFixed(3)} at`, t?.position);
        }).catch((err: unknown) => {
            reportError(new ResourceError(`model ${resourceId} load FAILED; keeping placeholder box`, { cause: err }), { tag: '[Avatar]', severity: 'warn' });
        });
    }
}
