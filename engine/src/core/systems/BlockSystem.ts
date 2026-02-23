import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, SolidComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctDefinition } from '../types/Adjunct';

/**
 * BlockSystem handles the transition from standard Block data (std) 
 * to Engine instances (3d). It manages block Groups and ground generation.
 * Now supports native Septopus raw data parsing.
 */
export class BlockSystem implements ISystem {
    private blockGroups: Map<string, THREE.Group> = new Map();
    private adjunctRegistry: Map<number, AdjunctDefinition> = new Map();
    private readonly BLOCK_SIZE = 16;

    constructor() {
        // Register native Septopus adjuncts
        this.adjunctRegistry.set(0x00a2, AdjunctBox);
    }

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

        // 1. Process Adjuncts (Support for both SPP Object and Septopus Array formats)
        const adjunctsToInit: any[] = [];

        block.adjuncts.forEach((adjData) => {
            // Detect Septopus Raw Array format: [hexId, [instances]]
            if (Array.isArray(adjData) && typeof adjData[0] === 'number') {
                const typeId = adjData[0];
                const instances = adjData[1];
                const definition = this.adjunctRegistry.get(typeId);

                if (definition) {
                    instances.forEach((rawInst: any[], idx: number) => {
                        const std = definition.attribute?.deserialize(rawInst);
                        if (std) {
                            adjunctsToInit.push({
                                ...std,
                                type: definition.hooks.reg().name,
                                id: `adj_${bKey}_${typeId}_${idx}`,
                                logicModule: definition
                            });
                        }
                    });
                }
            } else {
                // Legacy/SPP Fallback (already in std format)
                adjunctsToInit.push({ ...adjData, logicModule: AdjunctBox });
            }
        });

        // 2. Ensure ground exists (Protocol requirement)
        const hasGround = adjunctsToInit.some(a => a.id?.startsWith('ground'));

        if (!hasGround) {
            const groundId = world.createEntity();
            const groundStd = {
                type: "box",
                x: this.BLOCK_SIZE, y: this.BLOCK_SIZE, z: 0.1,
                ox: 8, oy: 8, oz: -0.05,
                rx: 0, ry: 0, rz: 0
            };

            world.addComponent<TransformComponent>(groundId, "TransformComponent", {
                position: [minX + 8, (block.elevation || 0) - 0.05, minZ - 8],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            });

            world.addComponent<AdjunctComponent>(groundId, "AdjunctComponent", {
                adjunctId: `ground_${bKey}`,
                isInitialized: false,
                logicModule: AdjunctBox,
                parentBlockEntityId: eid,
                stdData: groundStd as any
            });

            world.addComponent<SolidComponent>(groundId, "SolidComponent", {
                shape: "box",
                size: [this.BLOCK_SIZE, 0.1, this.BLOCK_SIZE],
                offset: [0, 0, 0]
            });
        }

        // 3. Instantiate adjunct entities
        adjunctsToInit.forEach((data) => {
            const adjId = world.createEntity();

            // Use centralized Coords utility for absolute world position
            const sppPos: [number, number, number] = [data.ox, data.oy, data.oz];
            const sppBlock: [number, number] = [block.x, block.y];
            const enginePos = Coords.sppToEngine(sppPos, sppBlock);

            // Add vertical offset to prevent Z-fighting
            enginePos[1] += 0.05;

            world.addComponent<TransformComponent>(adjId, "TransformComponent", {
                position: enginePos,
                rotation: [data.rx || 0, data.ry || 0, data.rz || 0],
                scale: [1, 1, 1]
            });

            world.addComponent<AdjunctComponent>(adjId, "AdjunctComponent", {
                adjunctId: data.id,
                isInitialized: false,
                logicModule: data.logicModule,
                parentBlockEntityId: eid,
                stdData: data
            });

            if (data.type === 'box' || data.stop) {
                world.addComponent<SolidComponent>(adjId, "SolidComponent", {
                    shape: "box",
                    size: [data.x, data.z, data.y], // Size mapping adjustment if needed
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
