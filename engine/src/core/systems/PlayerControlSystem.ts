import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { World, ISystem, EntityId } from '../World';
import { InputStateComponent, TransformComponent, RigidBodyComponent, CameraComponent } from '../components/PlayerComponents';

/**
 * ECS System for Player Control
 * Only handles Input -> Intent (Velocity / Look Direction).
 * DOES NOT APPLY COLLISION. PhysicsSystem handles application.
 */
export class PlayerControlSystem implements ISystem {
    private controls: PointerLockControls;
    private world: World;
    private controlledEntity: EntityId | null = null;

    // Internal state cache to prevent GC overhead
    private _velocity = new THREE.Vector3();
    private _direction = new THREE.Vector3();

    constructor(world: World, camera: THREE.Camera, domElement: HTMLElement) {
        this.world = world;

        // Initialize the Three.js native FPS controller
        this.controls = new PointerLockControls(camera, domElement);

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
                lookPitchDelta: 0, lookYawDelta: 0
            });
        }
    }

    public lock(): void {
        this.controls.lock();
    }

    public unlock(): void {
        this.controls.unlock();
    }

    public isLocked(): boolean {
        return this.controls.isLocked;
    }

    private bindEvents(domElement: HTMLElement): void {
        // DOM Listeners convert real interactions intoECS Component states.
        document.addEventListener('keydown', (e) => this.onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this.onKeyUp(e), false);

        domElement.addEventListener('click', () => {
            this.onMouseClick(true);
        });

        // Mouse Drag to Look (Desktop)
        domElement.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
        document.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
        document.addEventListener('mouseup', (e) => this.onMouseUp(e), false);

        // Touch Listeners (Mobile compatibility)
        domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        domElement.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        // Also handle touch cancel to prevent stuck looking
        domElement.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    }

    private lastTouchX: number = 0;
    private lastTouchY: number = 0;
    private touchLookActive: boolean = false;
    private activeLookTouchId: number | null = null;

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

        // Apply raw look deltas (tuning factor of 0.005)
        const yawDelta = -dx * 0.005;
        const pitchDelta = -dy * 0.005;

        this.controls.getObject().rotation.y += yawDelta;

        // Clamp the vertical pitch to avoid flipping over backward/forward (approx +/- 90 degrees)
        const pitchObj = this.controls.getObject().children[0];
        pitchObj.rotation.x += pitchDelta;
        pitchObj.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObj.rotation.x));
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

    private isMouseDown: boolean = false;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;

    private onMouseDown(event: MouseEvent): void {
        this.isMouseDown = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isMouseDown || !this.controlledEntity) return;

        const dx = event.clientX - this.lastMouseX;
        const dy = event.clientY - this.lastMouseY;

        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        const yawDelta = -dx * 0.005;
        const pitchDelta = -dy * 0.005;

        this.controls.getObject().rotation.y += yawDelta;

        const pitchObj = this.controls.getObject().children[0];
        pitchObj.rotation.x += pitchDelta;
        pitchObj.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObj.rotation.x));
    }

    private onMouseUp(event: MouseEvent): void {
        this.isMouseDown = false;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (!input) return;

        switch (event.code) {
            case 'ArrowUp': input.lookUp = true; break;
            case 'ArrowDown': input.lookDown = true; break;
            case 'ArrowLeft': input.lookLeft = true; break;
            case 'ArrowRight': input.lookRight = true; break;
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

        switch (event.code) {
            case 'ArrowUp': input.lookUp = false; break;
            case 'ArrowDown': input.lookDown = false; break;
            case 'ArrowLeft': input.lookLeft = false; break;
            case 'ArrowRight': input.lookRight = false; break;
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

        // 1. Calculate the intended velocity vector based on keys
        this._velocity.set(0, 0, 0);
        this._direction.set(0, 0, 0);

        this._direction.z = Number(input.forward) - Number(input.backward);
        this._direction.x = Number(input.right) - Number(input.left);

        // --- Gamepad Support ---
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = gamepads[0]; // Just use the first connected gamepad for now
        if (pad && pad.connected) {
            // Axis 0 = Left Stick X (Left/Right)
            // Axis 1 = Left Stick Y (Up/Down)
            // Axis 2 = Right Stick X (Look Yaw)
            // Axis 3 = Right Stick Y (Look Pitch)

            // Apply a small deadzone
            const deadzone = 0.1;

            if (Math.abs(pad.axes[1]) > deadzone) this._direction.z -= pad.axes[1] * 1.0; // Invert Y often needed
            if (Math.abs(pad.axes[0]) > deadzone) this._direction.x += pad.axes[0] * 1.0;

            // Map Buttons
            input.jump = input.jump || pad.buttons[0].pressed; // A button / Cross
            input.interactPrimary = input.interactPrimary || pad.buttons[2].pressed; // X button / Square
            input.run = input.run || pad.buttons[6].pressed || pad.buttons[7].pressed; // Triggers

            // Look controls via Right Stick (simulating mouse movement for PointerLock)
            if (Math.abs(pad.axes[2]) > deadzone) {
                const yawDelta = -pad.axes[2] * dt * 2.0;
                this.controls.getObject().rotation.y += yawDelta;
            }
            if (Math.abs(pad.axes[3]) > deadzone) {
                // Not ideal mutating Three camera directly here, but fits PointerLock
                const pitchDelta = -pad.axes[3] * dt * 2.0;
                // Pointer Lock uses a PitchObj inside a YawObj. We modify PitchObj.
                this.controls.getObject().children[0].rotation.x += pitchDelta;
            }
        }

        // --- Keyboard Look Support ---
        const turnSpeed = 2.0; // radians per second
        if (input.lookLeft) this.controls.getObject().rotation.y += turnSpeed * dt;
        if (input.lookRight) this.controls.getObject().rotation.y -= turnSpeed * dt;
        if (input.lookUp || input.lookDown) {
            const pitchObj = this.controls.getObject().children[0];
            const pitchDelta = (Number(input.lookUp) - Number(input.lookDown)) * turnSpeed * dt;
            pitchObj.rotation.x += pitchDelta;
            pitchObj.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObj.rotation.x));
        }

        this._direction.normalize(); // Ensure diagonal isn't faster

        // 2. Apply Speed rules & rotate into camera space
        const speed = input.run ? body.maxSpeedRun : body.maxSpeedWalk;

        // Local movement vector: right is +X, forward is -Z
        const localX = this._direction.x * speed;
        const localZ = -this._direction.z * speed;

        const yaw = this.controls.getObject().rotation.y;
        this._velocity.x = localX * Math.cos(yaw) + localZ * Math.sin(yaw);
        this._velocity.z = -localX * Math.sin(yaw) + localZ * Math.cos(yaw);

        // 3. Set the intention in the Component for the Physics System to read
        // Notice: We don't apply delta time (dt) here to position. We just define the VELOCITY.
        body.velocity[0] = this._velocity.x;
        body.velocity[2] = this._velocity.z;

        // 4. Jump Intention
        if (input.jump && body.isGrounded) {
            body.velocity[1] = body.jumpForce;
            body.isGrounded = false;
            input.jump = false; // Consume jump
        }

        // 5. Sync the PointerLock Camera position to the ECS Transform Position
        // The Physics System (running before or after) actually moves the Transform.
        if (camComp) {
            this.controls.getObject().position.set(
                trans.position[0] + camComp.offset[0],
                trans.position[1] + camComp.offset[1],
                trans.position[2] + camComp.offset[2]
            );
        }

        // 6. Sync Rotations
        // PointerLock natively manages the Camera's Euler array (YXZ). We sync it back.
        const euler = this.controls.getObject().rotation;
        trans.rotation[0] = euler.x;
        trans.rotation[1] = euler.y;
        trans.rotation[2] = euler.z;

        // Clear one-frame interaction flags
        input.interactPrimary = false;
        input.interactSecondary = false;
    }
}
