import { World, ISystem, EntityId } from '../World';
import {
    InputStateComponent, TransformComponent, RigidBodyComponent,
    CameraComponent, PlayerBodyComponent,
} from '../components/PlayerComponents';
import { Vector3 } from '../utils/Math';
import { Coords } from '../utils/Coords';
import { CONTROL_CONSTANTS, ENGINE_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { InputProvider } from '../systems/InputProvider';
import { MovementCollider } from './MovementCollider';
import { CameraRig } from './CameraRig';
import { reportError } from '../errors';

/**
 * CharacterController — the ISystem that orchestrates the controlled player's
 * movement each frame. It owns input, the desired-velocity intent, gravity +
 * jump, fall/void recovery and state persistence, and delegates the two heavy,
 * cohesive halves to helpers it composes:
 *   • MovementCollider — substepped AABB integration, step-over, ground probe,
 *     moving-platform carry.
 *   • CameraRig — look rotation, follow/observe camera, fall-impact shake,
 *     avatar pose + animation.
 * (Used to be one ~680-line class; split for readability — behaviour unchanged.)
 *
 * STABILITY: collision is continuous (gravity + AABB) but SUBSTEPPED in the
 * collider so a fast fall or large dt can never tunnel through thin ground.
 * Non-player rigid bodies are still handled by PhysicsSystem (which skips the
 * controlled player).
 */
export class CharacterController implements ISystem {
    private inputProvider: InputProvider;
    private controlledEntity: EntityId | null = null;

    private readonly collider = new MovementCollider();
    private readonly camera: CameraRig;

    // scratch / movement intent
    private _dir = new Vector3();

    // fall tracking + anti-void recovery net
    private _lastPos = new Vector3();
    private _lastRot = [0, 0, 0];
    private _fallStartY = 0;
    private _wasGrounded = true;
    private _safe: [number, number, number] | null = null;
    /** Grounded-flag flicker tolerance (standing still alternates the flag). */
    private _airFrames = 0;
    /** Edge detector for the embed-rescue warning (report once per episode). */
    private _wasEmbedded = false;

    /** Fall this far (m) below the last grounded spot -> treat as a void fall and
     *  recover. Engine DEFAULT — override via config player.capacity.voidRecover. */
    private static readonly VOID_RECOVER = 20;
    /** Ghost-mode vertical fly speed (m/s). Engine DEFAULT — override via config
     *  player.capacity.ghostFlySpeed. */
    private static readonly GHOST_FLY_SPEED = 6;

    /** player.capacity from the king's config (absent in bare tests → {}). */
    private capacityOf(world: World): any {
        return (world.config?.player as any)?.capacity ?? {};
    }

    constructor(_world: World, inputProvider: InputProvider) {
        this.inputProvider = inputProvider;
        this.camera = new CameraRig(inputProvider);
    }

    public attachToEntity(entity: EntityId): void {
        this.controlledEntity = entity;
        this.collider.setControlledEntity(entity);
    }

    // ── camera / view delegates (preserved public surface) ───────────────────
    public setViewMode(mode: 'first' | 'third'): void { this.camera.setViewMode(mode); }
    public getViewMode(): 'first' | 'third' { return this.camera.getViewMode(); }
    public toggleViewMode(): 'first' | 'third' { return this.camera.toggleViewMode(); }
    public getCameraShake(): number { return this.camera.getCameraShake(); }
    public getObserveState(): { azimuth: number; elevation: number; radius: number } {
        return this.camera.getObserveState();
    }
    /** Forces a solid-cache rebuild (e.g. after an editor moves an adjunct). */
    public invalidateSolidCache(): void { this.collider.invalidateSolidCache(); }

    public update(world: World, dt: number): void {
        if (!this.controlledEntity) return;
        const eid = this.controlledEntity;

        const input = world.getComponent<InputStateComponent>(eid, 'InputStateComponent');
        const body = world.getComponent<RigidBodyComponent>(eid, 'RigidBodyComponent');
        const trans = world.getComponent<TransformComponent>(eid, 'TransformComponent');
        const cam = world.getComponent<CameraComponent>(eid, 'CameraComponent');
        const pbody = world.getComponent<PlayerBodyComponent>(eid, 'PlayerBodyComponent');
        if (!input || !body || !trans) return;

        const stepHeight = pbody?.stepHeight ?? 0.5;

        // one-frame flags
        input.interactPrimary = false;
        input.interactSecondary = false;

        this.syncInputState(input);

        // Observe mode: player frozen, camera orbits the target. Owns the camera
        // itself (skips processLook) — drag to rotate, W/S to zoom.
        if (world.mode === SystemMode.Observe) {
            this.camera.processObserve(world, eid, trans, input, dt);
            this.inputProvider.flushDeltas();
            return;
        }

        this.camera.processLook(world, input, dt);

        // Ghost mode: incorporeal free-roam — no gravity, no collision, fly
        // vertically with Space (up) / Shift (down). Skips fall events and
        // void recovery (a ghost can hover over the abyss by design).
        if (world.mode === SystemMode.Ghost) {
            this.computeDesiredVelocity(world, input, body);
            const fly = (input.jump ? 1 : 0) - (input.run ? 1 : 0);
            body.velocity[1] = fly * (this.capacityOf(world).ghostFlySpeed ?? CharacterController.GHOST_FLY_SPEED);
            input.jump = false;
            trans.position[0] += body.velocity[0] * dt;
            trans.position[1] += body.velocity[1] * dt;
            trans.position[2] += body.velocity[2] * dt;
            body.isGrounded = false;
            this.camera.syncCameraAndAvatar(world, eid, trans, body, dt, cam);
            this.processPersistence(world, trans);
            this.inputProvider.flushDeltas();
            return;
        }

        this.computeDesiredVelocity(world, input, body);

        // jump impulse
        if (input.jump && body.isGrounded) {
            body.velocity[1] = body.jumpForce;
            body.isGrounded = false;
            this.collider.clearSupport();
        }
        input.jump = false;

        // Gravity — but ONLY when there is ground somewhere beneath the player.
        // If the column under the player has no solid (an unloaded/streaming block,
        // or a true void), HOVER instead of free-falling. This is the key stability
        // guarantee: the player never sinks through ground that hasn't streamed in
        // yet (the "walking along, fell below the block" symptom).
        this.collider.ensureSolidCache(world);
        this.collider.carrySupport(world, body, trans);

        // Spawn-inside-solid guard: a spawn/teleport/respawn (or a moving
        // authored solid) can PLACE the player inside a collider, where face
        // resolution just wedges them in place. Pop up onto the solid instead.
        // Report on the rising edge only — an animated solid can re-embed the
        // player every frame, and one warning per episode is enough.
        const embedded = this.collider.popOutIfEmbedded(body, trans);
        if (embedded && !this._wasEmbedded) {
            reportError('[player] placed inside a solid — popped onto its top face', {
                tag: '[CharacterController]', severity: 'warn',
            });
        }
        this._wasEmbedded = embedded;

        if (!this._safe) this._safe = [trans.position[0], trans.position[1], trans.position[2]];
        const groundBelow = this.collider.hasGroundBelow(trans, body);
        if (!groundBelow) {
            body.velocity[1] = 0;            // over unloaded/void area -> wait for ground
        } else if (!body.isGrounded) {
            // Base gravity is an engine constant; the per-world dial is the
            // capacity.gravityMultiplier landing on body.gravity (default 1).
            body.velocity[1] += ENGINE_CONSTANTS.GRAVITY * (body.gravity ?? 1) * dt;
        }

        this.collider.integrateAndCollide(world, body, trans, dt, stepHeight);
        this.voidRecovery(world, body, trans);

        // Drop the platform attachment after a SUSTAINED airborne streak — the
        // grounded flag flickers one frame while standing still (velocity 0
        // skips the landing probe), which must not detach a rider.
        if (body.isGrounded) {
            this._airFrames = 0;
        } else if (++this._airFrames > 2) {
            this.collider.clearSupport();
        }

        this.processFallEvents(world, body, trans, pbody);
        this.camera.syncCameraAndAvatar(world, eid, trans, body, dt, cam);
        this.processPersistence(world, trans);

        this.inputProvider.flushDeltas();
    }

    // ── input ────────────────────────────────────────────────────────────────
    private syncInputState(input: InputStateComponent): void {
        const ip = this.inputProvider;
        input.forward = ip.isKeyPressed('KeyW');
        input.backward = ip.isKeyPressed('KeyS');
        input.left = ip.isKeyPressed('KeyA');
        input.right = ip.isKeyPressed('KeyD');
        input.jump = input.jump || ip.isKeyJustPressed('Space');
        input.run = ip.isKeyPressed('ShiftLeft');
        input.interactPrimary = ip.isKeyJustPressed('KeyE') || ip.isMouseButtonJustPressed(0);
        input.interactSecondary = ip.isMouseButtonJustPressed(2);
        input.lookUp = ip.isKeyPressed('ArrowUp');
        input.lookDown = ip.isKeyPressed('ArrowDown');
        input.lookLeft = ip.isKeyPressed('ArrowLeft');
        input.lookRight = ip.isKeyPressed('ArrowRight');
        input.modifierAlt = ip.altKey;
        input.mouseNDC = [...ip.mouseNDC];
    }

    // ── desired horizontal velocity from intent + camera yaw ────────────────
    private computeDesiredVelocity(world: World, input: InputStateComponent, body: RigidBodyComponent): void {
        const pad = this.inputProvider.getGamepadState();
        this._dir.set(0, 0, 0);
        const kbZ = Number(input.forward) - Number(input.backward);
        const kbX = Number(input.right) - Number(input.left);
        this._dir.z = kbZ !== 0 ? kbZ : input.movementIntent[2];
        this._dir.x = kbX !== 0 ? kbX : input.movementIntent[0];
        if (pad.connected) {
            this._dir.z -= pad.axes[1];
            this._dir.x += pad.axes[0];
            input.run = input.run || pad.buttons[6] || pad.buttons[7];
        }
        if (this._dir.lengthSq() > 0) this._dir.normalize();

        const speed = input.run ? body.maxSpeedRun : body.maxSpeedWalk;
        const yaw = world.renderEngine.getMainCameraRotation()[1];
        const localX = this._dir.x * speed;
        const localZ = -this._dir.z * speed;
        body.velocity[0] = localX * Math.cos(yaw) + localZ * Math.sin(yaw);
        body.velocity[2] = -localX * Math.sin(yaw) + localZ * Math.cos(yaw);
    }

    // ── anti-void recovery net ───────────────────────────────────────────────
    /**
     * If the player sinks far below the last grounded spot (e.g. it crossed into
     * a block whose ground has not streamed in yet), return it to that safe spot.
     * Guarantees the player can never fall into the infinite void — the user's
     * "walking along, fell below the block" symptom. Normal falls land via the
     * substepped collision long before this triggers.
     */
    private voidRecovery(world: World, body: RigidBodyComponent, trans: TransformComponent): void {
        if (body.isGrounded) {
            this._safe = [trans.position[0], trans.position[1], trans.position[2]];
        } else if (this._safe && trans.position[1] < this._safe[1] - (this.capacityOf(world).voidRecover ?? CharacterController.VOID_RECOVER)) {
            trans.position[0] = this._safe[0];
            trans.position[1] = this._safe[1];
            trans.position[2] = this._safe[2];
            body.velocity[0] = body.velocity[1] = body.velocity[2] = 0;
            body.isGrounded = true;
            world.emitSimple('player:recovered', {});
        }
    }

    // ── fall / land events ──────────────────────────────────────────────────
    private processFallEvents(world: World, body: RigidBodyComponent, trans: TransformComponent, pbody?: PlayerBodyComponent): void {
        if (this._wasGrounded && !body.isGrounded) {
            this._fallStartY = trans.position[1]; // started falling
        } else if (!this._wasGrounded && body.isGrounded) {
            const drop = this._fallStartY - trans.position[1];
            const deathH = pbody?.fallDeathHeight ?? 12;
            if (drop >= deathH) world.emitSimple('player:fell', { drop });
            // Camera impact shake on any non-trivial landing (independent of the
            // lethal-fall threshold) — bigger drop, bigger jolt.
            this.camera.addImpactShake(drop);
        }
        this._wasGrounded = body.isGrounded;
    }

    // ── state persistence (player:state event) ───────────────────────────────
    private processPersistence(world: World, trans: TransformComponent): void {
        const distSq = this._lastPos.distanceToSquared(new Vector3(trans.position[0], trans.position[1], trans.position[2]));
        const rotDist = Math.abs(trans.rotation[1] - this._lastRot[1]);
        if (distSq > CONTROL_CONSTANTS.STATE_EMIT_THRESHOLD ** 2 || rotDist > CONTROL_CONSTANTS.ROT_EMIT_THRESHOLD) {
            const spp = Coords.engineToSpp(trans.position);
            const sppRot = Coords.engineRotationToSpp(trans.rotation);
            world.events.emit('player.state', {
                block: spp.block, position: spp.pos, rotation: sppRot,
            });
            // Durably persist the player's location (engine-owned, like inventory
            // and session) so a reload restores it — see Engine.hydrateDrafts. The
            // 0.5m/0.05rad emit gate above also rate-limits the write. ONLY in
            // walking modes: a Ghost (hovering) or Edit position must never become
            // the gameplay spawn. saveMeta is write-behind, so this never blocks.
            if (world.mode === SystemMode.Normal || world.mode === SystemMode.Game) {
                world.draftStore?.saveMeta?.(0, 'player', {
                    version: 1, block: spp.block, position: spp.pos, rotation: sppRot,
                });
            }
            this._lastPos.set(trans.position[0], trans.position[1], trans.position[2]);
            this._lastRot = [...trans.rotation];
        }
    }
}
