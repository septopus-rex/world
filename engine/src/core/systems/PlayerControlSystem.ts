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
            if (!this.controls.isLocked) {
                this.controls.lock();
            } else {
                this.onMouseClick(true);
            }
        });
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.controlledEntity) return;
        const input = this.world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        if (!input) return;

        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': input.forward = true; break;
            case 'ArrowLeft':
            case 'KeyA': input.left = true; break;
            case 'ArrowDown':
            case 'KeyS': input.backward = true; break;
            case 'ArrowRight':
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
            case 'ArrowUp':
            case 'KeyW': input.forward = false; break;
            case 'ArrowLeft':
            case 'KeyA': input.left = false; break;
            case 'ArrowDown':
            case 'KeyS': input.backward = false; break;
            case 'ArrowRight':
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

    /**
     * The Frame Tick
     */
    public update(world: World, dt: number): void {
        if (!this.controlledEntity || !this.controls.isLocked) return;

        const input = world.getComponent<InputStateComponent>(this.controlledEntity, "InputStateComponent");
        const body = world.getComponent<RigidBodyComponent>(this.controlledEntity, "RigidBodyComponent");
        const trans = world.getComponent<TransformComponent>(this.controlledEntity, "TransformComponent");
        const camComp = world.getComponent<CameraComponent>(this.controlledEntity, "CameraComponent");

        if (!input || !body || !trans) return;

        // 1. Calculate the intended velocity vector based on keys
        this._velocity.set(0, 0, 0);
        this._direction.set(0, 0, 0);

        Number(input.forward) - Number(input.backward);
        Number(input.right) - Number(input.left);

        this._direction.z = Number(input.forward) - Number(input.backward);
        this._direction.x = Number(input.right) - Number(input.left);
        this._direction.normalize(); // Ensure diagonal isn't faster

        // 2. Apply Speed rules
        const speed = input.run ? body.maxSpeedRun : body.maxSpeedWalk;
        if (input.forward || input.backward) this._velocity.z -= this._direction.z * speed;
        if (input.left || input.right) this._velocity.x -= this._direction.x * speed;

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
