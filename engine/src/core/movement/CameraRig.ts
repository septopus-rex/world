import { World, EntityId } from '../World';
import {
    InputStateComponent, TransformComponent, RigidBodyComponent,
    CameraComponent, AvatarComponent,
} from '../components/PlayerComponents';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { InputProvider } from '../systems/InputProvider';
import { feetY } from '../utils/Body';

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
    /** Airborne accumulator for the animation 'air' state (coyote time). The
     *  physics `isGrounded` flag flickers true/false EVERY frame on flat ground
     *  (gravity is skipped while grounded → no downward probe → not re-detected
     *  → one airborne frame → re-lands…). Feeding that raw into the state machine
     *  thrashed walk↔air each frame and reset the locomotion clip to frame 0
     *  (the "stiff avatar"). Only a SUSTAINED airborne streak is real 'air'. */
    private _airborneSec = 0;
    /** Coyote window: airborne must exceed this to count as 'air' (seconds). */
    private static readonly AIR_COYOTE = 0.12;
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
    /** First↔third dolly progress in [0,1] (0 = at the eyes, 1 = full follow-cam).
     *  Ramps at a fixed rate so it lands EXACTLY on the endpoint after
     *  VIEW_BLEND_SEC; a mid-transition flip just walks back the way it came. */
    private _viewT = 1;                          // matches viewMode's 'third' default
    private static readonly VIEW_BLEND_SEC = 0.3;
    /** Below this dolly distance the camera is inside the avatar's head — keep it
     *  hidden until the dolly clears the body, or the first frames of a
     *  first→third switch are a faceful of skull interior. */
    private static readonly AVATAR_CLEAR_DIST = 1.0;
    /** Extra metres the follow-cam is pulled back during a teleport transition
     *  (CharacterController drives this in/out). While pulling, the camera frames
     *  third-person even from first-person so the dolly-out is actually visible. */
    private _teleportPull = 0;
    /** Idle rest pitch in third-person: a slight downward tilt so the avatar is framed. */
    private static readonly TP_REST_PITCH = -0.34; // rad ≈ -19.5°
    /** Most GLTF characters face +Z; engine forward is -Z, so flip the avatar to face away. */
    private static readonly AVATAR_FACING = Math.PI;

    // ── turn-in-place (protocol avatar-animation.md §2, turn-in-place note) ──
    /** While the user actively HOLDS the look input (mouse drag / touch look /
     *  look keys / pad right stick) and stands still, the avatar's visual yaw
     *  FREEZES — you can orbit around to its face. On release it chases the
     *  authoritative yaw at this capped rate (shortest arc), stepping around
     *  with the walk clip. A per-frame rate limit alone does nothing: a normal
     *  drag moves the target < the cap each frame, so the avatar tracked
     *  rigidly and the shuffle never fired (verified in-browser, 2026-07-22).
     *  Presentation only: the transform rotation (movement basis, minimap
     *  marker) follows input instantly and is never touched by the chase. */
    private static readonly TURN_RATE = 5.2;        // rad/s ≈ 300°/s
    /** While MOVING the body swings toward the travel direction at this faster
     *  rate — direction changes must feel snappy, but an instant snap on a
     *  strafe reads as a glitch. */
    private static readonly TURN_RATE_MOVING = 12;  // rad/s ≈ 690°/s
    /** Remaining yaw error that still reads as "turning" for the anim gate —
     *  while above it a standing avatar plays the walk clip as an in-place
     *  shuffle; below it, close enough to idle without visible sliding. */
    private static readonly TURN_ANIM_MIN = 0.12;   // rad ≈ 7°
    /** §2 IDLE_MAX (m/s): also gates the look-held freeze — only a STANDING
     *  avatar freezes; a moving body must swing toward the travel direction. */
    private static readonly IDLE_MAX = 0.5;
    /** Pad right-stick deadzone that counts as "still looking". */
    private static readonly PAD_LOOK_DEADZONE = 0.2;
    /** Camera yaw seen last frame — a change queues a standing re-align. */
    private _lastCamYaw: number | null = null;
    /** A look operation moved the camera: once it's released (and the body is
     *  standing) the avatar chases the camera yaw. Movement CONSUMES it —
     *  stopping a strafe must not pirouette the body back to the camera. */
    private _alignPending = false;
    /** Avatar visual yaw (engine yaw; facing correction NOT included). null
     *  until the first sync seeds it — spawn/hydration must not shuffle-turn. */
    private _avatarYaw: number | null = null;

    /** Wrap an angle to (−π, π] — shortest-arc error for the yaw chase. */
    private static wrapPi(a: number): number {
        a = a % (2 * Math.PI);
        if (a > Math.PI) a -= 2 * Math.PI;
        else if (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }

    /** Move the visual yaw toward `target` by at most `maxStep` (shortest arc).
     *  Returns the REMAINING error after the move (0 once converged). */
    private chaseYaw(target: number, maxStep: number): number {
        const err = CameraRig.wrapPi(target - (this._avatarYaw as number));
        if (Math.abs(err) <= maxStep) {
            this._avatarYaw = target;
            return 0;
        }
        this._avatarYaw = CameraRig.wrapPi((this._avatarYaw as number) + Math.sign(err) * maxStep);
        return err - Math.sign(err) * maxStep;
    }

    constructor(inputProvider: InputProvider) {
        this.inputProvider = inputProvider;
    }

    /** Switch view. The dolly EASES by default (a user toggle should read as a
     *  camera move); `immediate` snaps it for tooling that positions the camera
     *  and samples the very next frame — screenshot rigs, pixel probes. */
    public setViewMode(mode: 'first' | 'third', immediate = false): void {
        this.viewMode = mode;
        if (immediate) this._viewT = mode === 'third' ? 1 : 0;
    }
    public getViewMode(): 'first' | 'third' { return this.viewMode; }
    /** Dolly progress in [0,1] (0 = first-person, 1 = full follow-cam) — diagnostics/tests. */
    public getViewBlend(): number { return this._viewT; }
    /** Teleport dolly-out distance (metres behind the normal follow position). */
    public setTeleportPull(metres: number): void { this._teleportPull = Math.max(0, metres); }
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

    /** Set the observe orbit explicitly (framing a target — e.g. tooling previews). */
    public setObserveOrbit(azimuth: number, elevation: number, radius: number): void {
        this._obsAzimuth = azimuth; this._obsElevation = elevation; this._obsRadius = radius;
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
            // touch look uses TOUCH sensitivity for BOTH axes (the old
            // touchDeltaX!==0 test made pure-vertical swipes use mouse sens).
            const isTouch = ip.touchLookActive || ip.touchDeltaX !== 0 || ip.touchDeltaY !== 0;
            const sens = isTouch ? CONTROL_CONSTANTS.TOUCH_SENSITIVITY : CONTROL_CONSTANTS.MOUSE_SENSITIVITY;
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
        // The eye offset's Y is an eye HEIGHT — measured from the feet (protocol
        // player.md §3.1), not from the transform, which is the capsule centre.
        const eyeX = trans.position[0] + ox, eyeY = feetY(trans, body) + oy, eyeZ = trans.position[2] + oz;

        // Look rotation is input-driven on the camera; read it first so third-person
        // can offset the camera by the current yaw.
        const camRot = world.renderEngine.getMainCameraRotation();
        const yaw = camRot[1];

        // Camera base position by view mode. A teleport pull forces third-person
        // framing (even from first-person) so the dolly-out reads on screen.
        //
        // The toggle moves the TARGET, not the camera: `_viewT` ramps at a fixed
        // rate and the follow-cam offsets scale by its smoothstep, so switching
        // is a dolly rather than a cut (the pitch already eased via auto-level —
        // only the position used to jump). blend 0 lands exactly on the eye.
        const pulling = this._teleportPull > 0.001;
        const rate = dt / CameraRig.VIEW_BLEND_SEC;
        this._viewT = Math.max(0, Math.min(1,
            this._viewT + ((this.viewMode === 'third' || pulling) ? rate : -rate)));
        const blend = this._viewT * this._viewT * (3 - 2 * this._viewT);

        // Follow-cam: sit behind the player along the horizontal look direction and
        // raised a little for a slight top-down angle. Camera keeps its input-driven
        // rotation, so it still looks where the mouse points (player out front).
        const dist = CameraRig.TP_DISTANCE * blend + this._teleportPull;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        let camX = eyeX - fx * dist;
        let camY = eyeY + CameraRig.TP_HEIGHT * blend;
        let camZ = eyeZ - fz * dist;

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
                ? feetY(trans, body) - avatar.footOffset
                : trans.position[1];
            world.renderEngine.setObjectPosition(avatar.handle, trans.position[0], avatarY, trans.position[2]);
            // Visible once the dolly has CLEARED the body — not merely "in
            // third-person": mid-transition (and during a teleport pull from
            // first-person) the camera passes through the avatar's head, and
            // showing it there fills the screen with backfaces.
            // Ghost mode always hides it (incorporeal).
            const show = avatar.visible !== false && dist >= CameraRig.AVATAR_CLEAR_DIST
                && world.mode !== SystemMode.Ghost;
            world.renderEngine.setObjectVisible(avatar.handle, show);

            // Avatar heading (visual only — the authoritative transform yaw
            // stays camera-locked for the movement basis and minimap marker):
            //   · MOVING → the body swings toward the horizontal velocity at a
            //     fast cap (yaw 0 faces −Z ⇒ atan2(−vx,−vz)): strafing and
            //     backpedalling turn the body instead of moonwalking.
            //   · STANDING + look HELD → freeze (orbit to the avatar's face).
            //   · STANDING after a look op released → chase the camera yaw at
            //     the turn-in-place rate, feet shuffling via the anim gate.
            //   · STANDING otherwise → hold the current heading: stopping a
            //     strafe must NOT pirouette the body back to the camera, so
            //     re-align is queued by CAMERA-YAW CHANGES, consumed by moving.
            //   · HIDDEN (first-person, ghost, dolly not clear) → snap, so
            //     switching back to third person never replays a stale spin.
            const hSpeedSq = body.velocity[0] * body.velocity[0] + body.velocity[2] * body.velocity[2];
            const camYaw = trans.rotation[1];
            const isMoving = hSpeedSq > CameraRig.IDLE_MAX * CameraRig.IDLE_MAX;
            const desiredYaw = isMoving ? Math.atan2(-body.velocity[0], -body.velocity[2]) : camYaw;
            if (this._lastCamYaw !== null && Math.abs(CameraRig.wrapPi(camYaw - this._lastCamYaw)) > 1e-6) {
                this._alignPending = true;
            }
            this._lastCamYaw = camYaw;
            let turning = false;
            if (this._avatarYaw === null || !show) {
                this._avatarYaw = desiredYaw;
                this._alignPending = false;
            } else if (isMoving) {
                this._alignPending = false;
                this.chaseYaw(desiredYaw, CameraRig.TURN_RATE_MOVING * dt);
            } else if (this._alignPending) {
                const ip = this.inputProvider;
                const pad = ip.getGamepadState();
                const input = world.getComponent<InputStateComponent>(eid, 'InputStateComponent');
                const lookHeld = ip.isMouseDown || ip.touchLookActive
                    || !!input?.lookLeft || !!input?.lookRight
                    || (pad.connected && Math.abs(pad.axes[2]) > CameraRig.PAD_LOOK_DEADZONE);
                if (!lookHeld) {
                    const rem = this.chaseYaw(desiredYaw, CameraRig.TURN_RATE * dt);
                    turning = Math.abs(rem) > CameraRig.TURN_ANIM_MIN;
                    if (rem === 0) this._alignPending = false;
                }
            }
            // Per-model facing correction (external models disagree on forward);
            // falls back to the legacy default when the avatar didn't declare one.
            const facing = avatar.facing !== undefined ? avatar.facing : CameraRig.AVATAR_FACING;
            world.renderEngine.setObjectRotation(avatar.handle, 0, this._avatarYaw + facing, 0);

            // Movement state → animation. NORMATIVE derivation — protocol
            // avatar-animation.md §2: idle ≤ IDLE_MAX (0.5 m/s) < walk ≤
            // WALK_MAX (maxSpeedWalk × 1.2, linear) < run; !grounded → air.
            // Compared squared to avoid the sqrt on the hot path.
            const walkMax = body.maxSpeedWalk * 1.2;   // WALK_MAX (§2)
            // Debounce 'air' with coyote time: the physics grounded flag flickers
            // one frame per two on flat ground, so require a SUSTAINED airborne
            // streak before animating 'air' — else walk/idle would reset every
            // other frame and look frozen. A real jump/fall clears the window fast.
            this._airborneSec = body.isGrounded ? 0 : this._airborneSec + dt;
            let animState = 'idle';
            if (this._airborneSec > CameraRig.AIR_COYOTE) animState = 'air';
            else if (hSpeedSq > walkMax * walkMax) animState = 'run';
            else if (hSpeedSq > CameraRig.IDLE_MAX * CameraRig.IDLE_MAX) animState = 'walk';
            // Turn-in-place shuffle (§2 turn note): standing but still chasing
            // the look yaw → the walk clip steps the feet around. The ONLY
            // exception to the speed→state derivation, and visual only. Frozen
            // (look held) is NOT turning — feet must not step under a held pose.
            else if (turning) animState = 'walk';
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

        // Orbit anchor: 1 m above the body CENTRE (≈ head height). Deliberately
        // transform-relative and NOT feet-anchored like the eye — this is a
        // framing choice, not a measured body landmark, and the tools that orbit
        // (SPP sandbox, block preview) set their azimuth/elevation/radius against
        // exactly this anchor. Re-basing it to the feet silently re-framed them.
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
