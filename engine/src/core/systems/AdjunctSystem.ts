import { World, ISystem, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { Coords } from '../utils/Coords';
import * as THREE from 'three';

export interface IAdjunctLogic {
    transform: {
        std_3d: (stds: any[], va: number) => any[];
    };
    menu: {
        sidebar: (params: any) => any;
    };
}

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

        // 1. Hierarchical Attachment
        let targetGroup: THREE.Object3D = world.scene;
        if (adjunct.parentBlockEntityId) {
            const block = world.getComponent<any>(adjunct.parentBlockEntityId, "BlockComponent");
            if (block && block.group) {
                targetGroup = block.group;
            }
        }

        let meshGroup = new THREE.Group();
        // Position is (0,0,0) relative to parent block group
        meshGroup.position.set(0, 0, 0);

        // Check if the adjunct module has the standard transformation methods
        if (logic.transform) {
            const elevation = 0; // Elevation handled by parent block group
            let renderDataList: any[] = [];

            try {
                if (typeof logic.transform.stdToRenderData === 'function') {
                    renderDataList = logic.transform.stdToRenderData([std], elevation);
                } else if (typeof logic.transform.std_3d === 'function') {
                    renderDataList = logic.transform.std_3d([std], elevation);
                }

                for (const renderItem of renderDataList) {
                    if (renderItem.type === 'box') {
                        // Use centralized Coords utility for dimension mapping
                        const dims = Coords.getBoxDimensions(renderItem.params.size);
                        const geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);

                        let itemColor = renderItem.material?.color || 0xcccccc;

                        // Ground coloring logic
                        if (renderItem.params.position[2] < 0) {
                            let bx = 0, by = 0;
                            if (adjunct.parentBlockEntityId) {
                                const b = world.getComponent<any>(adjunct.parentBlockEntityId, "BlockComponent");
                                if (b) { bx = b.x; by = b.y; }
                            }
                            const hash = (bx * 71 + by * 131);
                            itemColor = new THREE.Color().setHSL(((hash % 100) + 100) % 100 / 100, 0.5, 0.4).getHex();
                        }

                        const mat = new THREE.MeshStandardMaterial({ color: itemColor });
                        const mesh = new THREE.Mesh(geo, mat);

                        // Use centralized Coords utility for relative mesh position within block group
                        const engineLocalPos = Coords.localSppToEngine(renderItem.params.position);
                        mesh.position.set(engineLocalPos[0], engineLocalPos[1], engineLocalPos[2]);

                        mesh.rotation.set(
                            renderItem.params.rotation[0] || 0,
                            renderItem.params.rotation[1] || 0,
                            renderItem.params.rotation[2] || 0
                        );

                        meshGroup.add(mesh);
                    } else if (renderItem.type === 'sphere') {
                        const radius = renderItem.params.size[0] / 2;
                        const geo = new THREE.SphereGeometry(radius, 32, 32);
                        const mat = new THREE.MeshStandardMaterial({ color: renderItem.material?.color || 0xcccccc });
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.position.set(renderItem.params.position[0], renderItem.params.position[2], -renderItem.params.position[1]);
                        meshGroup.add(mesh);
                    }
                }
            } catch (error) {
                console.error(`[AdjunctSystem] Failed for ${adjunct.adjunctId}.`, error);
            }
        }

        // Attach to the determined parent
        targetGroup.add(meshGroup);
        (adjunct as any)._mesh = meshGroup;
        adjunct.isInitialized = true;
        this.initializedAdjuncts.add(entityId);

        // Notify if this was a critical block component
        if (adjunct.parentBlockEntityId) {
            world.emitSimple("world:block_ready", { blockId: adjunct.parentBlockEntityId });
        }
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
