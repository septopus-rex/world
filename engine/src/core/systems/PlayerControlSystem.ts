import { World, ISystem, EntityId } from '../World';
import { InputStateComponent, TransformComponent, RigidBodyComponent, CameraComponent, AvatarComponent } from '../components/PlayerComponents';
import { Vector3 } from '../utils/Math';
import { Coords } from '../utils/Coords';
import { CONTROL_CONSTANTS } from '../Constants';
import { SystemMode } from '../types/SystemMode';

/**
 * ECS System for Player Control
 * Only handles Input -> Intent (Velocity / Look Direction).
 * DOES NOT APPLY COLLISION. PhysicsSystem handles application.
 */
export class PlayerControlSystem implements ISystem {
    private domElement: HTMLElement;
    private world: World;
    private controlledEntity: EntityId | null = null;

    private keydownHandler!: (e: KeyboardEvent) => void;
    private keyupHandler!: (e: KeyboardEvent) => void;
    private mouseUpHandler!: (e: MouseEvent) => void;

    private lastTouchX: number = 0;
    private lastTouchY: number = 0;
    private touchLookActive: boolean = false;
    private activeLookTouchId: number | null = null;
    private isMouseDown: boolean = false;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;

    // Internal state cache to prevent GC overhead
    private _velocity = new Vector3();
    private _direction = new Vector3();
    private _lastPos = new Vector3();
    private _lastRot = [0, 0, 0];
    private _isPitchLocked = false;

    constructor(world: World, domElement: HTMLElement) {
        this.world = world;
        this.domElement = domElement;

        // Force 'YXZ' rotation order to prevent Gimbal Lock and tilting/roll issues
        // This is now handled within the RenderEngine initialization or via an engine API if needed.
        // For now, we assume the engine manages its own rotation orders.

        // Bind raw DOM events
        this.bindEvents(domElement);
    }

    /**
     * Attach this control system to a specific player entity.
     */
    public attachToEntity(entity: EntityId): void {
        this.controlledEntity = entity;

        // Ensure entity has necessary components
        if (!this.world.getComponent(entity, "InputStateComponent")) {
            this.world.addComponent<InputStateComponent>(entity, "InputStateComponent", {
                forward: false, backward: false, left: false, right: false, jump: false, run: false,
                interactPrimary: false, interactSecondary: false,
                lookUp: false, lookDown: false, lookLeft: false, lookRight: false,
                movementIntent: [0, 0, 0],
                lookPitchDelta: 0, lookYawDelta: 0,
                mouseNDC: [0, 0],
                modifierAlt: false
            });
        }
    }

    public lock(): void {
        // No longer using internal PointerLockControls.lock()
    }

    public unlock(): void {
        // No longer using internal PointerLockControls.unlock()
    }

    public isLocked(): boolean {
        return false;
    }

    /**
     * Bridges external Virtual Joystick inputs directly to the ECS InputState
     */
    public setMoveIntent(x: number, y: number) {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (input) {
            input.movementIntent[0] = x;
            input.movementIntent[2] = y;
        }
    }

    public triggerJump() {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (input) {
            input.jump = true;
        }
    }

    private bindEvents(domElement: HTMLElement): void {
        this.keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
        this.keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);
        this.mouseUpHandler = (e: MouseEvent) => this.onMouseUp(e);

        // DOM Listeners convert real interactions intoECS Component states.
        document.addEventListener('keydown', this.keydownHandler, false);
        document.addEventListener('keyup', this.keyupHandler, false);
        document.addEventListener('mouseup', this.mouseUpHandler, false);

        // Desktop Drag-to-Look
        domElement.addEventListener('mousedown', this._onMouseDown, false);
        domElement.addEventListener('mousemove', this._onMouseMove, false);

        // Touch Listeners (Mobile compatibility)
        domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
        domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
        domElement.addEventListener('touchend', this._onTouchEnd, { passive: false });
        domElement.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    }

    // Bind methods to maintain 'this' context for cleaner removal
    private _onMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    private _onMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    private _onTouchStart = (e: TouchEvent) => this.onTouchStart(e);
    private _onTouchMove = (e: TouchEvent) => this.onTouchMove(e);
    private _onTouchEnd = (e: TouchEvent) => this.onTouchEnd(e);

    public dispose(): void {
        document.removeEventListener('keydown', this.keydownHandler);
        document.removeEventListener('keyup', this.keyupHandler);
        document.removeEventListener('mouseup', this.mouseUpHandler);

        // Remove element-level listeners
        this.domElement.removeEventListener('mousedown', this._onMouseDown);
        this.domElement.removeEventListener('mousemove', this._onMouseMove);
        this.domElement.removeEventListener('touchstart', this._onTouchStart);
        this.domElement.removeEventListener('touchmove', this._onTouchMove);
        this.domElement.removeEventListener('touchend', this._onTouchEnd);
        this.domElement.removeEventListener('touchcancel', this._onTouchEnd);
    }

    private onTouchStart(event: TouchEvent): void {
        // Prevent default zoom/pan on mobile
        if (event.cancelable) event.preventDefault();

        // Assign touch to look control if it's on the right half of the screen
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.clientX > window.innerWidth / 2) {
                this.touchLookActive = true;
                this.activeLookTouchId = touch.identifier;
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
                break; // Only track one looking finger
            }
        }
    }

    private onTouchMove(event: TouchEvent): void {
        if (event.cancelable) event.preventDefault();
        if (!this.touchLookActive || !this.controlledEntity || this.activeLookTouchId === null) return;

        // Find the specific touch we are tracking for looking
        const touch = Array.from(event.touches).find(t => t.identifier === this.activeLookTouchId);
        if (!touch) return;

        const dx = touch.clientX - this.lastTouchX;
        const dy = touch.clientY - this.lastTouchY;

        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;

        // Apply raw look deltas
        const yawDelta = -dx * CONTROL_CONSTANTS.TOUCH_SENSITIVITY;
        const pitchDelta = -dy * CONTROL_CONSTANTS.TOUCH_SENSITIVITY;

        const rotation = this.world.renderEngine.getMainCameraRotation();
        rotation[1] += yawDelta;
        rotation[0] += pitchDelta;
        rotation[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation[0]));
        this.world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
    }

    private onTouchEnd(event: TouchEvent): void {
        if (event.cancelable) event.preventDefault();

        // Check if our tracked look-finger was lifted
        for (let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.activeLookTouchId) {
                this.touchLookActive = false;
                this.activeLookTouchId = null;
                break;
            }
        }
    }

    private onMouseDown(event: MouseEvent): void {
        this.isMouseDown = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        // Trigger interaction on click
        if (this.controlledEntity) {
            const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
            if (input) input.interactPrimary = true;
        }
    }

    private onMouseMove(event: MouseEvent): void {
        // Update Mouse NDC for picking
        if (this.controlledEntity) {
            const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
            if (input) {
                const rect = this.domElement.getBoundingClientRect();
                input.mouseNDC[0] = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                input.mouseNDC[1] = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            }
        }

        if (!this.isMouseDown) return;

        const dx = event.clientX - this.lastMouseX;
        const dy = event.clientY - this.lastMouseY;

        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        const yawDelta = -dx * CONTROL_CONSTANTS.MOUSE_SENSITIVITY;
        const pitchDelta = -dy * CONTROL_CONSTANTS.MOUSE_SENSITIVITY;

        // Suppress rotation in Edit Mode if moving an object
        if (this.world.mode === SystemMode.Edit && this.world.isMovingObject) {
            return;
        }

        const rotation = this.world.renderEngine.getMainCameraRotation();
        rotation[1] += yawDelta;
        rotation[0] += pitchDelta;
        rotation[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation[0]));
        this.world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
    }

    private onMouseUp(event: MouseEvent): void {
        this.isMouseDown = false;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (!input) return;

        input.modifierAlt = event.altKey;

        switch (event.code) {
            case 'ArrowUp':
                input.lookUp = true;
                if (event.altKey) event.preventDefault();
                break;
            case 'ArrowDown':
                input.lookDown = true;
                if (event.altKey) event.preventDefault();
                break;
            case 'ArrowLeft':
                input.lookLeft = true;
                break;
            case 'ArrowRight':
                input.lookRight = true;
                break;
            case 'KeyW': input.forward = true; break;
            case 'KeyA': input.left = true; break;
            case 'KeyS': input.backward = true; break;
            case 'KeyD': input.right = true; break;
            case 'Space': input.jump = true; break;
            case 'ShiftLeft': input.run = true; break;
            case 'KeyE': input.interactPrimary = true; break;
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (!input) return;

        input.modifierAlt = event.altKey;

        switch (event.code) {
            case 'ArrowUp':
                input.lookUp = false;
                break;
            case 'ArrowDown':
                input.lookDown = false;
                break;
            case 'ArrowLeft':
                input.lookLeft = false;
                break;
            case 'ArrowRight':
                input.lookRight = false;
                break;
            case 'KeyW': input.forward = false; break;
            case 'KeyA': input.left = false; break;
            case 'KeyS': input.backward = false; break;
            case 'KeyD': input.right = false; break;
            case 'Space': input.jump = false; break;
            case 'ShiftLeft': input.run = false; break;
            case 'KeyE': input.interactPrimary = false; break;
        }
    }

    private onMouseClick(isPrimary: boolean): void {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (input) {
            if (isPrimary) input.interactPrimary = true;
            else input.interactSecondary = true;
        }
    }

    public update(world: World, dt: number): void {
        if (!this.controlledEntity) return;

        const input = world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        const body = world.getComponent<RigidBodyComponent>(this.controlledEntity, "RigidBodyComponent");
        const trans = world.getComponent<TransformComponent>(this.controlledEntity, "TransformComponent");
        const camComp = world.getComponent<CameraComponent>(this.controlledEntity, "CameraComponent");

        if (!input || !body || !trans) return;

        // 1. Calculate the intended velocity vector based on keys & joystick
        this._velocity.set(0, 0, 0);
        this._direction.set(0, 0, 0);

        // A. Keyboard Intent
        let kbZ = Number(input.forward) - Number(input.backward);
        let kbX = Number(input.right) - Number(input.left);

        // B. Joystick Intent (API driven)
        let joyX = input.movementIntent[0];
        let joyZ = input.movementIntent[2];

        // Combine inputs (Keyboard usually takes precedence or they add up)
        this._direction.z = kbZ !== 0 ? kbZ : joyZ;
        this._direction.x = kbX !== 0 ? kbX : joyX;

        // --- Gamepad Support ---
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = gamepads[0]; // Just use the first connected gamepad for now
        if (pad && pad.connected) {
            const deadzone = CONTROL_CONSTANTS.DEADZONE;
            if (Math.abs(pad.axes[1]) > deadzone) this._direction.z -= pad.axes[1] * 1.0;
            if (Math.abs(pad.axes[0]) > deadzone) this._direction.x += pad.axes[0] * 1.0;

            input.jump = input.jump || pad.buttons[0].pressed;
            input.interactPrimary = input.interactPrimary || pad.buttons[2].pressed;
            input.run = input.run || pad.buttons[6].pressed || pad.buttons[7].pressed;

            if (Math.abs(pad.axes[2]) > deadzone) {
                const rotation = this.world.renderEngine.getMainCameraRotation();
                rotation[1] -= pad.axes[2] * dt * 2.0;
                this.world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
            }
            if (Math.abs(pad.axes[3]) > deadzone) {
                const rotation = this.world.renderEngine.getMainCameraRotation();
                rotation[0] -= pad.axes[3] * dt * 2.0;
                rotation[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation[0]));
                this.world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
            }
        }

        // --- Keyboard Look Support ---
        const camRot = this.world.renderEngine.getMainCameraRotation();
        const canRotate = !(world.mode === SystemMode.Edit && world.isMovingObject);

        if (canRotate) {
            if (input.lookLeft) camRot[1] += CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookRight) camRot[1] -= CONTROL_CONSTANTS.TURN_SPEED * dt;
            if (input.lookUp || input.lookDown) {
                const pitchDelta = (Number(input.lookUp) - Number(input.lookDown)) * CONTROL_CONSTANTS.TURN_SPEED * dt;
                camRot[0] += pitchDelta;
                camRot[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camRot[0]));
            }
        }

        // --- Camera Auto-Leveling ---
        // Check if any vertical look input is active
        const hasGamepadPitch = pad && pad.connected && Math.abs(pad.axes[3]) > CONTROL_CONSTANTS.DEADZONE;
        const keyboardPitchActive = input.lookUp || input.lookDown;
        const isPitchActive = keyboardPitchActive || this.isMouseDown || this.touchLookActive || hasGamepadPitch;

        // Sticky Logic: If Alt is held while moving via keyboard, lock it.
        // If moved via mouse/touch/gamepad or keyboard WITHOUT Alt, unlock it.
        if (keyboardPitchActive && input.modifierAlt) {
            this._isPitchLocked = true;
        } else if (isPitchActive) {
            this._isPitchLocked = false;
        }

        if (!isPitchActive && !this._isPitchLocked && Math.abs(camRot[0]) > 0.001) {
            camRot[0] -= camRot[0] * CONTROL_CONSTANTS.AUTO_LEVEL_SPEED * dt;
            if (Math.abs(camRot[0]) < 0.001) camRot[0] = 0;
        }

        this.world.renderEngine.setMainCameraRotation(camRot[0], camRot[1], camRot[2]);

        if (this._direction.lengthSq() > 0) {
            this._direction.normalize();
        }

        // 2. Apply Speed rules & rotate into camera space
        const speed = input.run ? body.maxSpeedRun : body.maxSpeedWalk;
        const localX = this._direction.x * speed;
        const localZ = -this._direction.z * speed;

        const yaw = camRot[1];

        // Suppress WASD movement in Edit Mode? 
        // User said: "左右移动是在调整位置，而不是控制player摇头"
        // If we still want player to move but NOT rotate, we keep this.
        // However, if we want WASD to ALSO move the object, we'd need another change.
        // For now, let's keep WASD player movement but ensure rotation is isolated.
        this._velocity.x = localX * Math.cos(yaw) + localZ * Math.sin(yaw);
        this._velocity.z = -localX * Math.sin(yaw) + localZ * Math.cos(yaw);

        // 3. Set the intention in the Component for the Physics System to read
        body.velocity[0] = this._velocity.x;
        body.velocity[2] = this._velocity.z;

        // 4. Jump Intention
        if (input.jump && body.isGrounded) {
            body.velocity[1] = body.jumpForce;
            body.isGrounded = false;
            input.jump = false;
        }

        // 5. Sync the Camera position to the ECS Transform Position
        this.world.renderEngine.setMainCameraPosition(
            trans.position[0] + (camComp?.offset[0] || 0),
            trans.position[1] + (camComp?.offset[1] || 0),
            trans.position[2] + (camComp?.offset[2] || 0)
        );

        // 6. Sync Rotations back to ECS
        const finalCamRot = this.world.renderEngine.getMainCameraRotation();
        trans.rotation[0] = finalCamRot[0];
        trans.rotation[1] = finalCamRot[1];
        trans.rotation[2] = 0;

        // 7. Sync Avatar Mesh (Third Person / Shadows)
        const avatar = this.world.getComponent<AvatarComponent>(this.controlledEntity, "AvatarComponent");
        if (avatar && avatar.handle) {
            this.world.renderEngine.setObjectPosition(avatar.handle, trans.position[0], trans.position[1], trans.position[2]);
            this.world.renderEngine.setObjectRotation(avatar.handle, 0, trans.rotation[1], 0); // Avatar only follows yaw
            this.world.renderEngine.setObjectVisible(avatar.handle, avatar.visible);
        }

        // 8. Emit Player State for Persistence if significantly changed
        const distSq = this._lastPos.distanceToSquared(new Vector3(trans.position[0], trans.position[1], trans.position[2]));
        const rotDist = Math.abs(trans.rotation[0] - this._lastRot[0]) +
            Math.abs(trans.rotation[1] - this._lastRot[1]) +
            Math.abs(trans.rotation[2] - this._lastRot[2]);

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

        // Clear one-frame interaction flags
        input.interactPrimary = false;
        input.interactSecondary = false;
    }
}
