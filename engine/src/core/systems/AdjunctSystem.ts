import { World, ISystem, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import * as THREE from 'three';

/**
 * AdjunctSystem
 *
 * This system brings SPP Adjuncts to life. It queries entities with an `AdjunctComponent` 
 * and actively manages their 3D Object representation and lifecycle standard actions 
 * (like initialization and timeline execution).
 */
export class AdjunctSystem implements ISystem {

    // Maintain a map to understand which entities have been initialized.
    private initializedAdjuncts: Set<EntityId> = new Set();

    public update(world: World, deltaTime: number): void {
        const adjunctEntities = world.queryEntities("AdjunctComponent");

        for (const entityId of adjunctEntities) {
            const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!adjunct || !transform) continue;

            // 1. Logic Module Execution
            // If the adjunct hasn't been visually instantiated, we read its logic module.
            if (!adjunct.isInitialized) {
                this.initializeAdjunct(world, entityId, adjunct, transform);
            }

            // 2. Timeline Animation Execution (Future Extension)
            // If `adjunct.stdData.animate` exists, parse the timeline and execute rotation/translation increments here.
            if (adjunct.stdData.animate) {
                this.processAnimTimeline(adjunct, transform, deltaTime);
            }
        }
    }

    /**
     * Initializes the Adjunct based on its formal `stdData`.
     * Applies precise math from `transform` to bridge Protocol Data to WebGL parameters.
     */
    private initializeAdjunct(world: World, entityId: EntityId, adjunct: AdjunctComponent, transform: TransformComponent) {
        if (!adjunct.logicModule) {
            console.warn(`[AdjunctSystem] Adjunct ${adjunct.adjunctId} has no attached tracking logicModule.`);
            return;
        }

        const logic = adjunct.logicModule;
        const std = adjunct.stdData;

        let meshGroup = new THREE.Group();

        // Check if the adjunct module has the standard transformation methods (defined in SPP protocol)
        if (logic.transform && typeof logic.transform.std_3d === 'function') {
            const elevation = transform.position[1]; // The Z-axis mapping for the World Height. (ThreeJS Y)

            // Reconstruct the 3D data pipeline via the Adjunct standard API.
            try {
                // std_3d expects an array of std objects.
                const renderDataList = logic.transform.std_3d([std], elevation);

                for (const renderItem of renderDataList) {
                    // For 'box' type specific items
                    if (renderItem.type === 'box') {
                        const geo = new THREE.BoxGeometry(
                            renderItem.params.size[0],
                            renderItem.params.size[1],
                            renderItem.params.size[2]
                        );
                        const mat = new THREE.MeshStandardMaterial({
                            color: renderItem.material?.color || 0xcccccc
                        });
                        const mesh = new THREE.Mesh(geo, mat);

                        // SPP Z-Up differs from ThreeJS Y-Up. The protocol says we map them.
                        mesh.position.set(
                            renderItem.params.position[0],
                            renderItem.params.position[2], // Mapping SPP Z to ThreeJS Y
                            renderItem.params.position[1]
                        );

                        mesh.rotation.set(
                            renderItem.params.rotation[0],
                            renderItem.params.rotation[2], // Mapping SPP rZ to ThreeJS rY
                            renderItem.params.rotation[1]
                        );

                        meshGroup.add(mesh);
                    }
                    // In the future: Add cylinder, cone, model loading here.
                }
            } catch (error) {
                console.error(`[AdjunctSystem] Failed to generate 3D mesh via logic module for ${adjunct.adjunctId}.`, error);
            }
        } else {
            console.warn(`[AdjunctSystem] Module for ${adjunct.adjunctId} does not implement 'transform.std_3d'.`);
        }

        // Finalize initialization
        world.scene.add(meshGroup);
        // Track the mesh via a reference on the adjunct component since there's no Object3DComponent
        (adjunct as any)._mesh = meshGroup;
        adjunct.isInitialized = true;
        this.initializedAdjuncts.add(entityId);
    }

    /**
     * Placeholder stub for the Timeline Animation Protocol.
     */
    private processAnimTimeline(adjunct: AdjunctComponent, transform: TransformComponent, deltaTime: number) {
        // Here we would apply Euler rotations or Position additions based on `adjunct.stdData.animate.timeline` array blocks.
        if (adjunct.stdData.animate?.router?.name === 'rotateY') { // Simplified fake handling for now
            transform.rotation[1] += deltaTime * 1.5;
        }
    }
}
