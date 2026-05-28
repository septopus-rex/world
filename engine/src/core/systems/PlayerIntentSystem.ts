import { World, ISystem, EntityId } from '../World';
import { InputStateComponent, TransformComponent, RigidBodyComponent, CameraComponent, AvatarComponent } from '../components/PlayerComponents';
import { Vector3 } from '../utils/Math';
import { Coords } from '../utils/Coords';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';
import { InputProvider } from './InputProvider';

export class PlayerIntentSystem implements ISystem {
    private inputProvider: InputProvider;
    private controlledEntity: EntityId | null = null;

    // Internal state cache
    private _velocity = new Vector3();
    private _direction = new Vector3();
    private _lastPos = new Vector3();
    private _lastRot = [0, 0, 0];
    private _isPitchLocked = false;

    constructor(world: World, inputProvider: InputProvider) {
        this.inputProvider = inputProvider;
    }

    public attachToEntity(entity: EntityId): void {
        this.controlledEntity = entity;
    }

    public update(world: World, dt: number): void {
        if (!this.controlledEntity) return;

        const input = world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        const body = world.getComponent<RigidBodyComponent>(this.controlledEntity, "RigidBodyComponent");
        const trans = world.getComponent<TransformComponent>(this.controlledEntity, "TransformComponent");
        const camComp = world.getComponent<CameraComponent>(this.controlledEntity, "CameraComponent");

        if (!input || !body || !trans) return;

        // 0. Reset one-frame flags at START of frame (allows other systems to see them before reset)
        input.interactPrimary = false;
        input.interactSecondary = false;
        input.jump = false;

        // 1. Sync Component state from InputProvider
        this.syncInputState(input);

        // 2. Process Looking Logic
        this.processLooking(world, input, dt);

        // 3. Process Movement Intent
        this.processMovement(world, input, body, trans, dt, camComp);

        // 4. Persistence & Sync
        this.processPersistence(world, trans);

        // Final: Flush input deltas
        this.inputProvider.flushDeltas();
    }

    private syncInputState(input: InputStateComponent): void {
        input.forward = this.inputProvider.isKeyPressed('KeyW');
        input.backward = this.inputProvider.isKeyPressed('KeyS');
        input.left = this.inputProvider.isKeyPressed('KeyA');
        input.right = this.inputProvider.isKeyPressed('KeyD');
        input.jump = this.inputProvider.isKeyJustPressed('Space');
        input.run = this.inputProvider.isKeyPressed('ShiftLeft');
        input.interactPrimary = this.inputProvider.isKeyJustPressed('KeyE') || this.inputProvider.isMouseButtonJustPressed(0);
        input.interactSecondary = this.inputProvider.isMouseButtonJustPressed(2);

        input.lookUp = this.inputProvider.isKeyPressed('ArrowUp');
        input.lookDown = this.inputProvider.isKeyPressed('ArrowDown');
        input.lookLeft = this.inputProvider.isKeyPressed('ArrowLeft');
        input.lookRight = this.inputProvider.isKeyPressed('ArrowRight');
        input.modifierAlt = this.inputProvider.altKey;

        input.mouseNDC = [...this.inputProvider.mouseNDC];
    }

    private processLooking(world: World, input: InputStateComponent, dt: number): void {
        const pad = this.inputProvider.getGamepadState();
        const camRot = world.renderEngine.getMainCameraRotation();
        const canRotate = !(world.mode === SystemMode.Edit && world.isMovingObject);

        if (canRotate) {
            // Mouse/Touch Look
            const dx = this.inputProvider.mouseDeltaX + this.inputProvider.touchDeltaX;
            const dy = this.inputProvider.mouseDeltaY + this.inputProvider.touchDeltaY;

            const sensitivity = this.inputProvider.touchDeltaX !== 0 ? CONTROL_CONSTANTS.TOUCH_SENSITIVITY : CONTROL_CONSTANTS.MOUSE_SENSITIVITY;

            camRot[1] -= dx * sensitivity;
            camRot[0] -= dy * sensitivity;

            // Keyboard Look
            if (input.lookLeft) camRot[1] += CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookRight) camRot[1] -= CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookUp || input.lookDown) {
                camRot[0] += (Number(input.lookUp) - Number(input.lookDown)) * CONTROL_CONSTANTS.TURN_SPEED * dt;
            }

            // Gamepad Look
            if (pad.connected) {
                camRot[1] -= pad.axes[2] * dt * 2.0;
                camRot[0] -= pad.axes[3] * dt * 2.0;
            }

            camRot[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camRot[0]));
        }

        // Auto-leveling
        const hasGamepadPitch = pad.connected && pad.axes[3] !== 0;
        const keyboardPitchActive = input.lookUp || input.lookDown;
        const isPitchActive = keyboardPitchActive || this.inputProvider.isMouseDown || this.inputProvider.touchLookActive || hasGamepadPitch;

        if (keyboardPitchActive && input.modifierAlt) {
            this._isPitchLocked = true;
        } else if (isPitchActive) {
            this._isPitchLocked = false;
        }

        if (!isPitchActive && !this._isPitchLocked && Math.abs(camRot[0]) > 0.001) {
            camRot[0] -= camRot[0] * CONTROL_CONSTANTS.AUTO_LEVEL_SPEED * dt;
            if (Math.abs(camRot[0]) < 0.001) camRot[0] = 0;
        }

        world.renderEngine.setMainCameraRotation(camRot[0], camRot[1], camRot[2]);
        if (world.ui) world.ui.updateCompass(camRot[1]);
    }

    private processMovement(world: World, input: InputStateComponent, body: RigidBodyComponent, trans: TransformComponent, dt: number, camComp?: CameraComponent): void {
        const pad = this.inputProvider.getGamepadState();
        this._direction.set(0, 0, 0);

        let kbZ = Number(input.forward) - Number(input.backward);
        let kbX = Number(input.right) - Number(input.left);

        this._direction.z = kbZ !== 0 ? kbZ : input.movementIntent[2];
        this._direction.x = kbX !== 0 ? kbX : input.movementIntent[0];

        if (pad.connected) {
            this._direction.z -= pad.axes[1];
            this._direction.x += pad.axes[0];
            input.jump = input.jump || pad.buttons[0];
            input.run = input.run || pad.buttons[6] || pad.buttons[7];
        }

        if (this._direction.lengthSq() > 0) this._direction.normalize();

        const speed = input.run ? body.maxSpeedRun : body.maxSpeedWalk;
        const yaw = world.renderEngine.getMainCameraRotation()[1];

        const localX = this._direction.x * speed;
        const localZ = -this._direction.z * speed;

        body.velocity[0] = localX * Math.cos(yaw) + localZ * Math.sin(yaw);
        body.velocity[2] = -localX * Math.sin(yaw) + localZ * Math.cos(yaw);

        if (input.jump && body.isGrounded) {
            body.velocity[1] = body.jumpForce;
            body.isGrounded = false;
            input.jump = false;
        }

        // Camera Sync
        world.renderEngine.setMainCameraPosition(
            trans.position[0] + (camComp?.offset[0] || 0),
            trans.position[1] + (camComp?.offset[1] || 0),
            trans.position[2] + (camComp?.offset[2] || 0)
        );

        // Transform Sync
        const finalCamRot = world.renderEngine.getMainCameraRotation();
        trans.rotation[0] = finalCamRot[0];
        trans.rotation[1] = finalCamRot[1];
        trans.dirty = true;

        // Avatar Sync
        const avatar = world.getComponent<AvatarComponent>(this.controlledEntity!, "AvatarComponent");
        if (avatar && avatar.handle) {
            world.renderEngine.setObjectPosition(avatar.handle, trans.position[0], trans.position[1], trans.position[2]);
            world.renderEngine.setObjectRotation(avatar.handle, 0, trans.rotation[1], 0);
            world.renderEngine.setObjectVisible(avatar.handle, avatar.visible);
        }
    }

    private processPersistence(world: World, trans: TransformComponent): void {
        const distSq = this._lastPos.distanceToSquared(new Vector3(trans.position[0], trans.position[1], trans.position[2]));
        const rotDist = Math.abs(trans.rotation[1] - this._lastRot[1]);

        if (distSq > CONTROL_CONSTANTS.STATE_EMIT_THRESHOLD * CONTROL_CONSTANTS.STATE_EMIT_THRESHOLD || rotDist > CONTROL_CONSTANTS.ROT_EMIT_THRESHOLD) {
            const spp = Coords.engineToSpp(trans.position);
            const sppRot = Coords.engineRotationToSpp(trans.rotation);

            world.emitSimple("player:state", {
                block: spp.block,
                position: spp.pos,
                rotation: sppRot
            });

            this._lastPos.set(trans.position[0], trans.position[1], trans.position[2]);
            this._lastRot = [...trans.rotation];
        }
    }
}
