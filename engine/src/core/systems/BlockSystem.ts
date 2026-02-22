import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, SolidComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { BasicBoxAdjunct } from '../../plugins/adjunct/basic_box';

/**
 * BlockSystem handles the transition from standard Block data (std) 
 * to Engine instances (3d). It manages block Groups and ground generation.
 */
export class BlockSystem implements ISystem {
    private blockGroups: Map<string, THREE.Group> = new Map();
    private readonly BLOCK_SIZE = 16;

    public update(world: World, dt: number): void {
        const blockEntities = world.queryEntities("BlockComponent");

        for (const eid of blockEntities) {
            const block = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (!block || block.isInitialized) continue;

            this.initializeBlock(world, eid, block);
            block.isInitialized = true;
        }
    }

    private initializeBlock(world: World, eid: EntityId, block: BlockComponent) {
        const bKey = `${block.x}_${block.y}`;
        if (this.blockGroups.has(bKey)) return;

        // Use Coords utility to determine world origin of this block
        const worldPos = Coords.sppToEngine([0, 0, 0], [block.x, block.y]);
        const minX = worldPos[0];
        const minZ = worldPos[2];

        const group = new THREE.Group();
        // Position the group at the world origin of the block
        group.position.set(minX, block.elevation || 0, minZ);
        world.scene.add(group);

        block.group = group;
        this.blockGroups.set(bKey, group);

        // 1. Ensure ground exists (Protocol requirement)
        const hasGround = block.adjuncts.some(a => a.id?.startsWith('ground'));

        if (!hasGround) {
            const groundId = world.createEntity();
            // Center of the 16x16 area
            world.addComponent<TransformComponent>(groundId, "TransformComponent", {
                position: [minX + 8, block.elevation || 0, minZ + 8],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            });

            world.addComponent<AdjunctComponent>(groundId, "AdjunctComponent", {
                adjunctId: `ground_${block.x}_${block.y}`,
                isInitialized: false,
                logicModule: BasicBoxAdjunct,
                parentBlockEntityId: eid,
                stdData: {
                    type: "box",
                    params: {
                        size: [this.BLOCK_SIZE, 2.0, this.BLOCK_SIZE],
                        position: [8, 8, -1.0], // Relative to block corner (8, 8) is center
                        rotation: [0, 0, 0]
                    }
                }
            });

            // Add SolidComponent for physics
            world.addComponent<SolidComponent>(groundId, "SolidComponent", {
                shape: "box",
                size: [this.BLOCK_SIZE, 2.0, this.BLOCK_SIZE],
                offset: [0, -1.0, 0]
            });
        }

        // 2. Instantiate actual adjuncts from intermediate data (std)
        block.adjuncts.forEach((data: any) => {
            const adjId = world.createEntity();

            const localPos = data.params.position || [0, 0, 0];
            // Protocol Pos [X, Y, Z] -> Engine Pos [X, Z, Y]
            const finalWorldPos: [number, number, number] = [
                localPos[0] + minX,
                (localPos[2] || 0) + (block.elevation || 0), // Z(Height) -> Y + Block Elevation
                localPos[1] + minZ  // Y(North) -> Z
            ];

            world.addComponent<TransformComponent>(adjId, "TransformComponent", {
                position: finalWorldPos,
                rotation: (data.params.rotation || [0, 0, 0]) as [number, number, number],
                scale: [1, 1, 1]
            });

            world.addComponent<AdjunctComponent>(adjId, "AdjunctComponent", {
                adjunctId: data.id || `adj_${block.x}_${block.y}`,
                isInitialized: false,
                logicModule: BasicBoxAdjunct,
                parentBlockEntityId: eid,
                stdData: data
            });

            // Add SolidComponent if it's a box (for physics)
            if (data.type === 'box') {
                world.addComponent<SolidComponent>(adjId, "SolidComponent", {
                    shape: "box",
                    size: (data.params.size || [1, 1, 1]) as [number, number, number],
                    offset: [0, 0, 0]
                });
            }
        });
    }

    /**
     * Toggles visibility of block groups based on current required keys.
     * This decouples the Loader's logic from ThreeJS internals.
     */
    public syncVisibility(requiredKeys: string[]) {
        this.blockGroups.forEach((group, key) => {
            group.visible = requiredKeys.includes(key);
        });
    }
}
