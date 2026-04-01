import { World, ISystem, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { MeshComponent } from '../components/VisualizationComponents';

/**
 * VisualSyncSystem automatically synchronizes ECS TransformComponent data
 * to the RenderEngine handles stored in MeshComponent.
 */
export class VisualSyncSystem implements ISystem {
    public update(world: World, dt: number): void {
        const entities = world.getEntitiesWith(["TransformComponent", "MeshComponent"]);

        for (const eid of entities) {
            const trans = world.getComponent<TransformComponent>(eid, "TransformComponent")!;
            const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent")!;

            if (!mesh.handle) continue;
            const obj = mesh.handle as any;

            // 1. Sync Position — delegate parent-local conversion to RenderEngine abstraction
            const [lx, ly, lz] = world.renderEngine.worldToLocal(
                mesh.handle,
                trans.position[0], trans.position[1], trans.position[2]
            );
            obj.position.set(lx, ly, lz);

            // 2. Sync Rotation
            if (mesh.syncRotation !== false) {
                if (mesh.syncRotationAxes) {
                    const currentRot = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
                    const nextRot = [
                        mesh.syncRotationAxes[0] ? trans.rotation[0] : currentRot[0],
                        mesh.syncRotationAxes[1] ? trans.rotation[1] : currentRot[1],
                        mesh.syncRotationAxes[2] ? trans.rotation[2] : currentRot[2]
                    ];
                    obj.rotation.set(nextRot[0], nextRot[1], nextRot[2]);
                } else {
                    obj.rotation.set(trans.rotation[0], trans.rotation[1], trans.rotation[2]);
                }
            }

            // 3. Sync Scale
            if (mesh.syncScale) {
                world.renderEngine.setObjectScale(
                    mesh.handle,
                    trans.scale[0],
                    trans.scale[1],
                    trans.scale[2]
                );
            }

            // 4. Sync Visibility (if state changed)
            if (mesh.visible !== undefined) {
                world.renderEngine.setObjectVisible(mesh.handle, mesh.visible);
            }
        }
    }
}
