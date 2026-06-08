import { World, ISystem, EntityId } from '../World';
import {
    InputStateComponent, TransformComponent, RigidBodyComponent,
    CameraComponent, AvatarComponent, SolidComponent, PlayerBodyComponent,
} from '../components/PlayerComponents';
import { Vector3, Box3 } from '../utils/Math';
import { Coords } from '../utils/Coords';
import { CONTROL_CONSTANTS, ENGINE_CONSTANTS, PHYSICS_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { InputProvider } from '../systems/InputProvider';

/** Pre-computed solid AABB for fast, allocation-free collision. */
interface SolidEntry { px: number; py: number; pz: number; hx: number; hy: number; hz: number; }

/**
 * CharacterController — the single, consolidated home for the controlled
 * player's movement. Absorbs what used to be split across PlayerIntentSystem
 * (look + intent + camera + persistence) and PhysicsSystem (integrate + collide)
 * so step-over, ground, gravity and intent all live in one place.
 *
 * STABILITY: collision uses continuous physics (gravity + AABB) but is
 * SUBSTEPPED — each integration step moves at most STEP_CLAMP metres, so a fast
 * fall or a large frame dt can never tunnel through the thin ground (the bug
 * the old discrete single-endpoint check had). Low obstacles (<= body.stepHeight)
 * are auto-stepped onto instead of hard-blocking.
 *
 * Non-player rigid bodies are still handled by PhysicsSystem (which skips the
 * controlled player).
 */
export class CharacterController implements ISystem {
    private inputProvider: InputProvider;
    private controlledEntity: EntityId | null = null;

    // scratch
    private _dir = new Vector3();
    private _playerBox = new Box3();
    private _wallBox = new Box3();
    private _pPos = new Vector3();
    private _wPos = new Vector3();
    private _lastPos = new Vector3();
    private _lastRot = [0, 0, 0];
    private _isPitchLocked = false;
    private _fallStartY = 0;
    private _wasGrounded = true;
    private _safe: [number, number, number] | null = null;

    // solid cache (rebuilt when solid count changes)
    private _solids: SolidEntry[] = [];
    private _solidIds: EntityId[] = [];
    private _lastSolidCount = -1;

    /** Max metres moved per collision substep (< thinnest ground -> no tunneling). */
    private static readonly STEP_CLAMP = 0.08;
    private static readonly MAX_SUBSTEPS = 48;
    /** Fall this far (m) below the last grounded spot -> treat as a void fall and recover. */
    private static readonly VOID_RECOVER = 20;

    /** Camera view: first-person (at the eyes) or third-person (behind + slightly above). */
    private viewMode: 'first' | 'third' = 'third';
    private static readonly TP_DISTANCE = 4.5;  // metres the follow-cam sits behind
    private static readonly TP_HEIGHT = 1.2;    // metres above the eye
    /** Idle rest pitch in third-person: a slight downward tilt so the avatar is framed. */
    private static readonly TP_REST_PITCH = -0.34; // rad ≈ -19.5°
    /** Most GLTF characters face +Z; engine forward is -Z, so flip the avatar to face away. */
    private static readonly AVATAR_FACING = Math.PI;

    public setViewMode(mode: 'first' | 'third'): void { this.viewMode = mode; }
    public getViewMode(): 'first' | 'third' { return this.viewMode; }
    public toggleViewMode(): 'first' | 'third' {
        this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
        return this.viewMode;
    }

    constructor(_world: World, inputProvider: InputProvider) {
        this.inputProvider = inputProvider;
    }

    public attachToEntity(entity: EntityId): void {
        this.controlledEntity = entity;
    }

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
        this.processLook(world, input, dt);
        this.computeDesiredVelocity(world, input, body);

        // jump impulse
        if (input.jump && body.isGrounded) {
            body.velocity[1] = body.jumpForce;
            body.isGrounded = false;
        }
        input.jump = false;

        // Gravity — but ONLY when there is ground somewhere beneath the player.
        // If the column under the player has no solid (an unloaded/streaming block,
        // or a true void), HOVER instead of free-falling. This is the key stability
        // guarantee: the player never sinks through ground that hasn't streamed in
        // yet (the "walking along, fell below the block" symptom).
        this.ensureSolidCache(world);
        if (!this._safe) this._safe = [trans.position[0], trans.position[1], trans.position[2]];
        const groundBelow = this.hasGroundBelow(trans, body);
        if (!groundBelow) {
            body.velocity[1] = 0;            // over unloaded/void area -> wait for ground
        } else if (!body.isGrounded) {
            body.velocity[1] += ENGINE_CONSTANTS.GRAVITY * dt;
        }

        this.integrateAndCollide(world, body, trans, dt, stepHeight);
        this.voidRecovery(world, body, trans);

        this.processFallEvents(world, body, trans, pbody);
        this.syncCameraAndAvatar(world, eid, trans, body, dt, cam);
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

    // ── look (camera rotation) ──────────────────────────────────────────────
    private processLook(world: World, input: InputStateComponent, dt: number): void {
        const ip = this.inputProvider;
        const pad = ip.getGamepadState();
        const camRot = world.renderEngine.getMainCameraRotation();
        const canRotate = !(world.mode === SystemMode.Edit && world.isMovingObject);

        if (canRotate) {
            const dx = ip.mouseDeltaX + ip.touchDeltaX;
            const dy = ip.mouseDeltaY + ip.touchDeltaY;
            const sens = ip.touchDeltaX !== 0 ? CONTROL_CONSTANTS.TOUCH_SENSITIVITY : CONTROL_CONSTANTS.MOUSE_SENSITIVITY;
            camRot[1] -= dx * sens;
            camRot[0] -= dy * sens;
            if (input.lookLeft) camRot[1] += CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookRight) camRot[1] -= CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookUp || input.lookDown) {
                camRot[0] += (Number(input.lookUp) - Number(input.lookDown)) * CONTROL_CONSTANTS.TURN_SPEED * dt;
            }
            if (pad.connected) { camRot[1] -= pad.axes[2] * dt * 2.0; camRot[0] -= pad.axes[3] * dt * 2.0; }
            camRot[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camRot[0]));
        }

        const keyboardPitch = input.lookUp || input.lookDown;
        const pitchActive = keyboardPitch || ip.isMouseDown || ip.touchLookActive || (pad.connected && pad.axes[3] !== 0);
        if (keyboardPitch && input.modifierAlt) this._isPitchLocked = true;
        else if (pitchActive) this._isPitchLocked = false;
        // Idle auto-level: ease pitch toward a rest angle — horizontal in first-person,
        // a slight downward tilt in third-person so the avatar stays framed (otherwise
        // the raised follow-cam looks straight over the avatar's head).
        const restPitch = this.viewMode === 'third' ? CharacterController.TP_REST_PITCH : 0;
        if (!pitchActive && !this._isPitchLocked && Math.abs(camRot[0] - restPitch) > 0.001) {
            camRot[0] -= (camRot[0] - restPitch) * CONTROL_CONSTANTS.AUTO_LEVEL_SPEED * dt;
            if (Math.abs(camRot[0] - restPitch) < 0.001) camRot[0] = restPitch;
        }
        world.renderEngine.setMainCameraRotation(camRot[0], camRot[1], camRot[2]);
        if (world.ui) world.ui.updateCompass(camRot[1]);
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

    // ── integrate + collide (SUBSTEPPED, with step-over) ────────────────────
    private integrateAndCollide(world: World, body: RigidBodyComponent, trans: TransformComponent, dt: number, stepHeight: number): void {
        this.ensureSolidCache(world);

        const dxTotal = body.velocity[0] * dt;
        const dyTotal = body.velocity[1] * dt;
        const dzTotal = body.velocity[2] * dt;

        const maxComp = Math.max(Math.abs(dxTotal), Math.abs(dyTotal), Math.abs(dzTotal));
        const n = Math.min(CharacterController.MAX_SUBSTEPS, Math.max(1, Math.ceil(maxComp / CharacterController.STEP_CLAMP)));
        const sx = dxTotal / n, sy = dyTotal / n, sz = dzTotal / n;

        body.isGrounded = false;
        for (let i = 0; i < n; i++) {
            this.resolveY(body, trans, sy);
            this.resolveHorizontal(body, trans, sx, 0, stepHeight); // X
            this.resolveHorizontal(body, trans, 0, sz, stepHeight); // Z
        }
        trans.dirty = true;

        // friction on horizontal velocity
        body.velocity[0] *= body.friction;
        body.velocity[2] *= body.friction;
    }

    private resolveY(body: RigidBodyComponent, trans: TransformComponent, sy: number): void {
        if (sy === 0) return;
        const nextY = trans.position[1] + sy;
        this._pPos.set(trans.position[0] + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
        this._playerBox.setFromCenterAndSize(this._pPos, { x: body.size[0], y: body.size[1], z: body.size[2] });

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            this._wPos.set(w.px, w.py, w.pz);
            this._wallBox.setFromCenterAndSize(this._wPos, { x: w.hx * 2, y: w.hy * 2, z: w.hz * 2 });
            if (this._playerBox.intersectsBox(this._wallBox)) {
                if (sy < 0) { // landing
                    trans.position[1] = (w.py + w.hy) + body.size[1] / 2 - body.offset[1];
                    body.velocity[1] = 0;
                    body.isGrounded = true;
                } else { // ceiling
                    trans.position[1] = (w.py - w.hy) - body.size[1] / 2 - body.offset[1];
                    body.velocity[1] = 0;
                }
                return;
            }
        }
        trans.position[1] = nextY;
    }

    private resolveHorizontal(body: RigidBodyComponent, trans: TransformComponent, sx: number, sz: number, stepHeight: number): void {
        const move = sx !== 0 ? sx : sz;
        if (move === 0) return;
        const axis = sx !== 0 ? 0 : 2;
        const nextX = trans.position[0] + sx;
        const nextZ = trans.position[2] + sz;
        const margin = PHYSICS_CONSTANTS.MARGIN, eps = PHYSICS_CONSTANTS.EPSILON;

        this._pPos.set(nextX + body.offset[0], trans.position[1] + body.offset[1], nextZ + body.offset[2]);
        this._playerBox.setFromCenterAndSize(this._pPos, {
            x: body.size[0] - margin * 2, y: body.size[1] - eps * 2, z: body.size[2] - margin * 2,
        });

        const feetY = trans.position[1] + body.offset[1] - body.size[1] / 2;

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            this._wPos.set(w.px, w.py, w.pz);
            this._wallBox.setFromCenterAndSize(this._wPos, { x: w.hx * 2, y: w.hy * 2, z: w.hz * 2 });
            if (!this._playerBox.intersectsBox(this._wallBox)) continue;

            // Step-over: if the obstacle's top is within stepHeight of the feet,
            // climb onto it instead of blocking (low curbs / stop volumes).
            const stepUp = (w.py + w.hy) - feetY;
            if (stepUp > 0.001 && stepUp <= stepHeight) {
                trans.position[1] = (w.py + w.hy) + body.size[1] / 2 - body.offset[1];
                if (body.velocity[1] < 0) body.velocity[1] = 0;
                body.isGrounded = true;
                continue; // allow the horizontal move
            }

            // Block: snap to the obstacle face on this axis.
            if (axis === 0) {
                trans.position[0] = sx > 0 ? (w.px - w.hx) - body.size[0] / 2 - body.offset[0]
                                           : (w.px + w.hx) + body.size[0] / 2 - body.offset[0];
                body.velocity[0] = 0;
            } else {
                trans.position[2] = sz > 0 ? (w.pz - w.hz) - body.size[2] / 2 - body.offset[2]
                                           : (w.pz + w.hz) + body.size[2] / 2 - body.offset[2];
                body.velocity[2] = 0;
            }
            return;
        }
        trans.position[0] = nextX;
        trans.position[2] = nextZ;
    }

    private ensureSolidCache(world: World): void {
        const solids = world.queryEntities('SolidComponent');
        if (solids.length === this._lastSolidCount) return;
        this._lastSolidCount = solids.length;
        this._solidIds = solids;
        this._solids = solids.map((sid) => {
            const s = world.getComponent<SolidComponent>(sid, 'SolidComponent')!;
            const t = world.getComponent<TransformComponent>(sid, 'TransformComponent');
            const p = t?.position ?? [0, 0, 0];
            return {
                px: p[0] + s.offset[0], py: p[1] + s.offset[1], pz: p[2] + s.offset[2],
                hx: s.size[0] / 2, hy: s.size[1] / 2, hz: s.size[2] / 2,
            };
        });
    }

    /** Forces a solid-cache rebuild (e.g. after an editor moves an adjunct). */
    public invalidateSolidCache(): void { this._lastSolidCount = -1; }

    /**
     * True if any solid sits in the player's X/Z column at or below the feet —
     * i.e. there IS ground to fall onto. False over an unloaded/streaming block
     * or a genuine void (so the controller hovers instead of free-falling).
     */
    private hasGroundBelow(trans: TransformComponent, body: RigidBodyComponent): boolean {
        const px = trans.position[0] + body.offset[0];
        const pz = trans.position[2] + body.offset[2];
        const feet = trans.position[1] + body.offset[1] - body.size[1] / 2;
        const hx = body.size[0] / 2, hz = body.size[2] / 2;
        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            if (Math.abs(px - w.px) <= w.hx + hx && Math.abs(pz - w.pz) <= w.hz + hz) {
                if (w.py + w.hy <= feet + 0.2) return true; // a surface at/below the feet
            }
        }
        return false;
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
        } else if (this._safe && trans.position[1] < this._safe[1] - CharacterController.VOID_RECOVER) {
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
        }
        this._wasGrounded = body.isGrounded;
    }

    // ── camera + avatar sync ─────────────────────────────────────────────────
    private syncCameraAndAvatar(world: World, eid: EntityId, trans: TransformComponent, body: RigidBodyComponent, dt: number, cam?: CameraComponent): void {
        const ox = cam?.offset[0] ?? 0, oy = cam?.offset[1] ?? 1.7, oz = cam?.offset[2] ?? 0;
        const eyeX = trans.position[0] + ox, eyeY = trans.position[1] + oy, eyeZ = trans.position[2] + oz;

        // Look rotation is input-driven on the camera; read it first so third-person
        // can offset the camera by the current yaw.
        const camRot = world.renderEngine.getMainCameraRotation();
        const yaw = camRot[1];

        if (this.viewMode === 'third') {
            // Follow-cam: sit behind the player along the horizontal look direction and
            // raised a little for a slight top-down angle. Camera keeps its input-driven
            // rotation, so it still looks where the mouse points (player out front).
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            world.renderEngine.setMainCameraPosition(
                eyeX - fx * CharacterController.TP_DISTANCE,
                eyeY + CharacterController.TP_HEIGHT,
                eyeZ - fz * CharacterController.TP_DISTANCE
            );
        } else {
            world.renderEngine.setMainCameraPosition(eyeX, eyeY, eyeZ);
        }

        trans.rotation[0] = camRot[0];
        trans.rotation[1] = camRot[1];

        const avatar = world.getComponent<AvatarComponent>(eid, 'AvatarComponent');
        if (avatar && avatar.handle) {
            world.renderEngine.setObjectPosition(avatar.handle, trans.position[0], trans.position[1], trans.position[2]);
            world.renderEngine.setObjectRotation(avatar.handle, 0, trans.rotation[1] + CharacterController.AVATAR_FACING, 0);
            // Visible only in third-person — in first-person the camera is inside the avatar.
            const show = avatar.visible !== false && this.viewMode === 'third';
            world.renderEngine.setObjectVisible(avatar.handle, show);
            (world.renderEngine as any).updateAnimation(avatar.handle, dt);
        }
    }

    // ── state persistence (player:state event) ───────────────────────────────
    private processPersistence(world: World, trans: TransformComponent): void {
        const distSq = this._lastPos.distanceToSquared(new Vector3(trans.position[0], trans.position[1], trans.position[2]));
        const rotDist = Math.abs(trans.rotation[1] - this._lastRot[1]);
        if (distSq > CONTROL_CONSTANTS.STATE_EMIT_THRESHOLD ** 2 || rotDist > CONTROL_CONSTANTS.ROT_EMIT_THRESHOLD) {
            const spp = Coords.engineToSpp(trans.position);
            world.emitSimple('player:state', {
                block: spp.block, position: spp.pos, rotation: Coords.engineRotationToSpp(trans.rotation),
            });
            this._lastPos.set(trans.position[0], trans.position[1], trans.position[2]);
            this._lastRot = [...trans.rotation];
        }
    }
}
