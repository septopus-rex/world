import { World, EntityId } from '../World';
import {
    InputStateComponent, TransformComponent, RigidBodyComponent,
    CameraComponent, AvatarComponent,
} from '../components/PlayerComponents';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { InputProvider } from '../systems/InputProvider';

/**
 * CameraRig — the camera + avatar half of the controlled player, extracted from
 * CharacterController: look rotation, the first/third-person follow camera,
 * observe-mode orbit, the decaying fall-impact shake, and avatar pose/anim sync.
 * It owns only camera/view state; the controller drives it each frame and feeds
 * it the player's transform/body. Nothing here mutates the player transform
 * except the camera-only shake (which never does).
 */
export class CameraRig {
    private inputProvider: InputProvider;

    private _isPitchLocked = false;

    // ── camera impact shake (fall "juice") ───────────────────────────────────
    /** Decaying [0..1] shake magnitude, set on a hard landing. Folded into the
     *  camera position each frame — never touches the player transform. The old
     *  engine's effects/camera/fall did the dip; linger (the eased recovery) was
     *  an empty stub — both live here now as one decaying envelope. */
    private _camShake = 0;
    private _shakePhase = 0;
    private static readonly SHAKE_MIN_DROP = 1.5;   // m: below this, no shake
    private static readonly SHAKE_FULL_DROP = 8;    // m: full-strength shake
    private static readonly SHAKE_DECAY = 0.5;      // s to fade to zero (the "linger")
    private static readonly SHAKE_DIP = 0.35;       // m the camera dips at full impact
    private static readonly SHAKE_AMP = 0.08;       // m lateral jitter at full impact
    private static readonly SHAKE_FREQ = 38;        // jitter oscillation rate

    // ── observe-mode orbit camera ─────────────────────────────────────────────
    /** Spherical orbit around the player/target: drag rotates, W/S zooms. */
    private _obsAzimuth = 0;
    private _obsElevation = 0.5;
    private _obsRadius = 8;
    private static readonly OBS_ZOOM_SPEED = 12;    // m/s via forward/back
    private static readonly OBS_MIN_RADIUS = 1.5;
    private static readonly OBS_MAX_RADIUS = 40;

    /** Camera view: first-person (at the eyes) or third-person (behind + slightly above). */
    private viewMode: 'first' | 'third' = 'third';
    private static readonly TP_DISTANCE = 4.5;  // metres the follow-cam sits behind
    private static readonly TP_HEIGHT = 1.2;    // metres above the eye
    /** Idle rest pitch in third-person: a slight downward tilt so the avatar is framed. */
    private static readonly TP_REST_PITCH = -0.34; // rad ≈ -19.5°
    /** Most GLTF characters face +Z; engine forward is -Z, so flip the avatar to face away. */
    private static readonly AVATAR_FACING = Math.PI;

    constructor(inputProvider: InputProvider) {
        this.inputProvider = inputProvider;
    }

    public setViewMode(mode: 'first' | 'third'): void { this.viewMode = mode; }
    public getViewMode(): 'first' | 'third' { return this.viewMode; }
    public toggleViewMode(): 'first' | 'third' {
        this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
        return this.viewMode;
    }

    /** Current camera-impact shake level [0..1] (diagnostics/tests). */
    public getCameraShake(): number { return this._camShake; }
    /** Current observe-orbit state (diagnostics/tests). */
    public getObserveState(): { azimuth: number; elevation: number; radius: number } {
        return { azimuth: this._obsAzimuth, elevation: this._obsElevation, radius: this._obsRadius };
    }

    /** Register a landing's drop height; raises the impact-shake envelope. */
    public addImpactShake(drop: number): void {
        if (drop <= CameraRig.SHAKE_MIN_DROP) return;
        const t = Math.min(1, (drop - CameraRig.SHAKE_MIN_DROP) /
            (CameraRig.SHAKE_FULL_DROP - CameraRig.SHAKE_MIN_DROP));
        this._camShake = Math.max(this._camShake, t);
    }

    // ── look (camera rotation) ──────────────────────────────────────────────
    public processLook(world: World, input: InputStateComponent, dt: number): void {
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
        const restPitch = this.viewMode === 'third' ? CameraRig.TP_REST_PITCH : 0;
        if (!pitchActive && !this._isPitchLocked && Math.abs(camRot[0] - restPitch) > 0.001) {
            camRot[0] -= (camRot[0] - restPitch) * CONTROL_CONSTANTS.AUTO_LEVEL_SPEED * dt;
            if (Math.abs(camRot[0] - restPitch) < 0.001) camRot[0] = restPitch;
        }
        world.renderEngine.setMainCameraRotation(camRot[0], camRot[1], camRot[2]);
        if (world.ui) world.ui.updateCompass(camRot[1]);
    }

    // ── camera + avatar sync ─────────────────────────────────────────────────
    public syncCameraAndAvatar(world: World, eid: EntityId, trans: TransformComponent, body: RigidBodyComponent, dt: number, cam?: CameraComponent): void {
        const ox = cam?.offset[0] ?? 0, oy = cam?.offset[1] ?? 1.7, oz = cam?.offset[2] ?? 0;
        const eyeX = trans.position[0] + ox, eyeY = trans.position[1] + oy, eyeZ = trans.position[2] + oz;

        // Look rotation is input-driven on the camera; read it first so third-person
        // can offset the camera by the current yaw.
        const camRot = world.renderEngine.getMainCameraRotation();
        const yaw = camRot[1];

        // Camera base position by view mode.
        let camX: number, camY: number, camZ: number;
        if (this.viewMode === 'third') {
            // Follow-cam: sit behind the player along the horizontal look direction and
            // raised a little for a slight top-down angle. Camera keeps its input-driven
            // rotation, so it still looks where the mouse points (player out front).
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            camX = eyeX - fx * CameraRig.TP_DISTANCE;
            camY = eyeY + CameraRig.TP_HEIGHT;
            camZ = eyeZ - fz * CameraRig.TP_DISTANCE;
        } else {
            camX = eyeX; camY = eyeY; camZ = eyeZ;
        }

        // Fold in the decaying impact shake — a downward dip + lateral jitter,
        // applied to the camera ONLY (the player transform stays clean).
        const shake = this.updateCameraShake(dt);
        if (shake > 0) {
            this._shakePhase += dt * CameraRig.SHAKE_FREQ;
            const amp = CameraRig.SHAKE_AMP * shake;
            camX += Math.sin(this._shakePhase) * amp;
            camY += -CameraRig.SHAKE_DIP * shake + Math.cos(this._shakePhase * 1.3) * amp * 0.5;
        }
        world.renderEngine.setMainCameraPosition(camX, camY, camZ);

        trans.rotation[0] = camRot[0];
        trans.rotation[1] = camRot[1];

        const avatar = world.getComponent<AvatarComponent>(eid, 'AvatarComponent');
        if (avatar && avatar.handle) {
            // Plant the avatar's feet on the ground. A loaded GLTF whose pivot is at
            // its feet (footOffset≈0) would otherwise float ~half the body height
            // when placed at the body centre. footOffset = scaled bbox bottom vs the
            // model origin; placing at feetY − footOffset puts the model's bottom on
            // the collision feet. The centred box placeholder leaves footOffset
            // undefined → placed at the body centre, as before.
            const avatarY = avatar.footOffset !== undefined
                ? (trans.position[1] + body.offset[1] - body.size[1] / 2) - avatar.footOffset
                : trans.position[1];
            world.renderEngine.setObjectPosition(avatar.handle, trans.position[0], avatarY, trans.position[2]);
            // Per-model facing correction (external models disagree on forward);
            // falls back to the legacy default when the avatar didn't declare one.
            const facing = avatar.facing !== undefined ? avatar.facing : CameraRig.AVATAR_FACING;
            world.renderEngine.setObjectRotation(avatar.handle, 0, trans.rotation[1] + facing, 0);
            // Visible only in third-person — in first-person the camera is inside
            // the avatar. Ghost mode always hides it (incorporeal).
            const show = avatar.visible !== false && this.viewMode === 'third'
                && world.mode !== SystemMode.Ghost;
            world.renderEngine.setObjectVisible(avatar.handle, show);

            // Movement state → animation. NORMATIVE derivation — protocol
            // avatar-animation.md §2: idle ≤ IDLE_MAX (0.5 m/s) < walk ≤
            // WALK_MAX (maxSpeedWalk × 1.2, linear) < run; !grounded → air.
            // Compared squared to avoid the sqrt on the hot path.
            const hSpeedSq = body.velocity[0] * body.velocity[0] + body.velocity[2] * body.velocity[2];
            const walkMax = body.maxSpeedWalk * 1.2;   // WALK_MAX (§2)
            const IDLE_MAX = 0.5;                       // m/s (§2)
            let animState = 'idle';
            if (!body.isGrounded) animState = 'air';
            else if (hSpeedSq > walkMax * walkMax) animState = 'run';
            else if (hSpeedSq > IDLE_MAX * IDLE_MAX) animState = 'walk';
            (world.renderEngine as any).setAnimationState?.(avatar.handle, animState);
            (world.renderEngine as any).updateAnimation(avatar.handle, dt);
        }
    }

    // ── observe-mode orbit camera ─────────────────────────────────────────────
    public processObserve(world: World, eid: EntityId, trans: TransformComponent, input: InputStateComponent, dt: number): void {
        const ip = this.inputProvider;
        const sens = CONTROL_CONSTANTS.MOUSE_SENSITIVITY;
        this._obsAzimuth -= (ip.mouseDeltaX + ip.touchDeltaX) * sens;
        this._obsElevation -= (ip.mouseDeltaY + ip.touchDeltaY) * sens;
        if (input.lookLeft) this._obsAzimuth += CONTROL_CONSTANTS.TURN_SPEED * dt;
        if (input.lookRight) this._obsAzimuth -= CONTROL_CONSTANTS.TURN_SPEED * dt;
        if (input.lookUp) this._obsElevation += CONTROL_CONSTANTS.TURN_SPEED * dt;
        if (input.lookDown) this._obsElevation -= CONTROL_CONSTANTS.TURN_SPEED * dt;
        this._obsElevation = Math.max(-1.4, Math.min(1.4, this._obsElevation));
        // W/S zoom the orbit in/out.
        if (input.forward) this._obsRadius = Math.max(CameraRig.OBS_MIN_RADIUS, this._obsRadius - CameraRig.OBS_ZOOM_SPEED * dt);
        if (input.backward) this._obsRadius = Math.min(CameraRig.OBS_MAX_RADIUS, this._obsRadius + CameraRig.OBS_ZOOM_SPEED * dt);

        // Orbit around the player's chest height; camera always faces the target.
        const tx = trans.position[0], ty = trans.position[1] + 1, tz = trans.position[2];
        const ce = Math.cos(this._obsElevation), se = Math.sin(this._obsElevation), r = this._obsRadius;
        world.renderEngine.setMainCameraPosition(
            tx + r * ce * Math.sin(this._obsAzimuth),
            ty + r * se,
            tz + r * ce * Math.cos(this._obsAzimuth),
        );
        world.renderEngine.setMainCameraLookAt(tx, ty, tz);

        // The avatar stays visible — you're inspecting it from outside.
        const avatar = world.getComponent<AvatarComponent>(eid, 'AvatarComponent');
        if (avatar?.handle) world.renderEngine.setObjectVisible(avatar.handle, avatar.visible !== false);
    }

    /** Decay the camera-impact shake envelope one frame; returns the level. */
    private updateCameraShake(dt: number): number {
        if (this._camShake > 0) {
            this._camShake = Math.max(0, this._camShake - dt / CameraRig.SHAKE_DECAY);
        }
        return this._camShake;
    }
}
