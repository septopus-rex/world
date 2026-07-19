import { World, EntityId } from './World';
import { reportError, ResourceError } from './errors';
import { TransformComponent, RigidBodyComponent, CameraComponent, InputStateComponent, AvatarComponent, PlayerBodyComponent } from './components/PlayerComponents';
import { InventoryComponent } from './components/InventoryComponent';
import { HealthComponent } from './components/HealthComponent';
import { CharacterController } from './movement/CharacterController';
import { feetY } from './utils/Body';

/** Per-avatar DECLARED visual physique (catalog/record data — never measured
 *  from the model's geometry). See protocol player.md §3. */
export interface AvatarPhysique { height?: number; eyeHeight?: number }

/**
 * Effective VISUAL physique for an avatar: declared data wins, clamped into the
 * world's permitted range (`physique.avatarHeightRange`, default [0.5, 3]); the
 * world baseline fills gaps. A declared height without an eyeHeight derives the
 * eye proportionally from the baseline's eye ratio, and the eye can never sit
 * above the head. Physics NEVER reads this — the collision capsule, step and
 * jump stay on the world's physique baseline (player.md §2): the avatar owns
 * how the player LOOKS and SEES, the world owns what the player physically IS.
 */
export function resolveAvatarPhysique(config: any, declared?: AvatarPhysique | null): { height: number; eyeHeight: number } {
    const phy = (config?.player as any)?.physique ?? {};
    const baseHeight = Number(phy.height) || 1.8;
    const baseEye = Number(phy.eyeHeight) || 1.7;
    const range: [number, number] = Array.isArray(phy.avatarHeightRange) && phy.avatarHeightRange.length === 2
        ? [Number(phy.avatarHeightRange[0]), Number(phy.avatarHeightRange[1])]
        : [0.5, 3.0];
    const declH = Number(declared?.height);
    const height = declared?.height != null && Number.isFinite(declH) && declH > 0
        ? Math.min(Math.max(declH, range[0]), range[1])
        : baseHeight;
    // Proportional derivation collapses to the baseline eye when nothing is
    // declared (height === baseHeight ⇒ eye === baseEye).
    const declE = Number(declared?.eyeHeight);
    const eyeRaw = declared?.eyeHeight != null && Number.isFinite(declE) && declE > 0
        ? declE
        : height * (baseEye / baseHeight);
    const eyeHeight = Math.min(Math.max(eyeRaw, 0.1), height);
    return { height, eyeHeight };
}

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
        // Physique baseline is DATA (player.physique, D9). It is the PHYSICS
        // authority: collision capsule, step, jump. The VISUAL body (model scale,
        // camera eyeHeight) follows the avatar's own declared physique instead —
        // resolved in loadAvatarModel when the model lands; until then (and for
        // undeclared avatars) the baseline below applies. Engine values are
        // only fallbacks for absent config fields.
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
            physique: avatarCfg.physique ?? undefined,
        });

        // The avatar is just a model resource (IPFS-fetchable) — reuse the model
        // pipeline: show the placeholder box now, swap in the loaded model when it
        // resolves (load-once-by-id, dedup-ready for future multiplayer).
        if (avatarRes != null) {
            EntityFactory.loadAvatarModel(world, player, String(avatarRes), avatarHandle);
        }

        // Initial Camera Sync — the eye rides eyeHeight above the FEET, and
        // `position` is the capsule centre (utils/Body.feetY); the body was just
        // created with offset 0, so the feet are half a body below it.
        world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
        world.renderEngine.setMainCameraPosition(position[0], position[1] - bodyHeight / 2 + eyeHeight, position[2]);

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
     * scale uniformly to the avatar's declared visual height (world baseline when
     * undeclared, world-clamped otherwise) and ride the camera at its eyeHeight;
     * add it to the scene (CharacterController positions/rotates it each frame).
     * Eviction-safe: keeps the placeholder — and the old eye — if the load fails.
     */
    /**
     * Swap the player's avatar at runtime (the frontend picker seam). Reuses the
     * exact load path: the CURRENT handle plays the "placeholder" role — removed
     * only when the new model lands, kept on a failed load. The old model's
     * ResourceManager refcount is released after a successful swap.
     */
    public static swapAvatar(world: World, resourceId: string, facing?: number, physique?: AvatarPhysique): void {
        const players = world.queryEntities("AvatarComponent", "InputStateComponent");
        const player = players[0];
        if (player === undefined) return;
        const av = world.getComponent<AvatarComponent>(player, "AvatarComponent");
        if (!av || av.resource === resourceId) return;
        const releaseId = av.resource;      // refcount to drop once the swap lands
        av.resource = resourceId;
        if (typeof facing === 'number') av.facing = facing; // per-model orientation
        // Declared physique belongs to the AVATAR: an undeclared one resets to
        // the world baseline (never inherit the previous body's declaration).
        av.physique = physique;
        EntityFactory.loadAvatarModel(world, player, resourceId, av.handle, releaseId);
    }

    private static loadAvatarModel(world: World, player: EntityId, resourceId: string, placeholder: any, releaseResource?: string): void {
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

            // Visual physique: the avatar's DECLARED body parameters (clamped by
            // the world) — not the physics baseline, which stays untouched.
            const visual = resolveAvatarPhysique(world.config, av.physique);

            // Uniform scale-to-body (preserve aspect). Guard against a degenerate
            // bound (e.g. empty Box3) so the avatar never scales to 0 / NaN.
            const h = entry.bounds.max.y - entry.bounds.min.y;
            const k = Number.isFinite(h) && h > 1e-4 ? visual.height / h : 1;
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
                model.position?.set?.(t.position[0], feetY(t, rb) - (av.footOffset ?? 0), t.position[2]);
            }

            world.renderEngine.add(model);          // into the scene; posed each frame by the controller
            world.renderEngine.removeHandle(placeholder);   // also stops its mixer
            if (releaseResource != null) rm.release?.(releaseResource); // old avatar's instance refcount
            av.handle = model;
            av.visible = true;

            // The camera's eye follows the body it embodies: apply the avatar's
            // (clamped) eyeHeight exactly when the visible body changes — a
            // failed load keeps the old body AND the old eye, and the stale-load
            // guard above means the LAST requested avatar sets the final eye.
            const cam = world.getComponent<CameraComponent>(player, "CameraComponent");
            if (cam) cam.offset[1] = visual.eyeHeight;

            // Wire skeletal animation via the render layer (keeps core Three.js-free).
            // Clips come from the entry (real AnimationClip instances) — clone
            // userData is JSON-mangled by Object3D.copy and must not be trusted.
            const clips: any[] = entry.animations ?? model.userData?.animations ?? [];
            if (clips.length > 0) {
                (world.renderEngine as any).startAnimation(model, clips);
            }

            let meshes = 0; model.traverse?.((o: any) => { if (o.isMesh) meshes++; });
            console.log(`[Avatar] loaded ${resourceId}: meshes=${meshes} clips=${clips.length} visualH=${visual.height} eyeH=${visual.eyeHeight} srcH=${h?.toFixed?.(2)} scale=${k.toFixed(3)} at`, t?.position);
        }).catch((err: unknown) => {
            reportError(new ResourceError(`model ${resourceId} load FAILED; keeping placeholder box`, { cause: err }), { tag: '[Avatar]', severity: 'warn' });
        });
    }
}
