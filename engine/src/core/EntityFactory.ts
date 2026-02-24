import { World, EntityId } from './World';
import { TransformComponent, RigidBodyComponent, CameraComponent, InputStateComponent, AvatarComponent } from './components/PlayerComponents';

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

        world.addComponent<RigidBodyComponent>(player, "RigidBodyComponent", {
            size: [0.6, 1.8, 0.6],
            offset: [0, 0, 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: 5,
            maxSpeedRun: 10,
            jumpForce: 8,
            gravity: 1,
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
            offset: [0, 1.7, 0],
            fov: 75,
            active: true
        });

        const avatarHandle = world.renderEngine.createAvatarMesh();
        world.renderEngine.setObjectPosition(avatarHandle, position[0], position[1], position[2]);

        world.addComponent<AvatarComponent>(player, "AvatarComponent", {
            handle: avatarHandle,
            visible: true
        });

        // Initial Camera Sync
        world.renderEngine.setMainCameraRotation(rotation[0], rotation[1], rotation[2]);
        world.renderEngine.setMainCameraPosition(position[0], position[1] + 1.7, position[2]);

        return player;
    }
}
