import { World, ISystem, EntityId } from '../World';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, SolidComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Coords } from '../utils/Coords';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctTrigger } from '../../plugins/adjunct/adjunct_trigger';
import { AdjunctDefinition, RenderHandle } from '../types/Adjunct';

/**
 * BlockSystem handles the transition from standard Block data (std) 
 * to Engine instances (3d). It manages block Groups and ground generation.
 */
export class BlockSystem implements ISystem {
    private blockGroups: Map<string, RenderHandle> = new Map();
    private adjunctRegistry: Map<number, AdjunctDefinition> = new Map();

    constructor() {
        // Register native Septopus adjuncts
        this.adjunctRegistry.set(0x00a2, AdjunctBox as any);
        this.adjunctRegistry.set(0x00b8, AdjunctTrigger as any);
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

        const [bw, bl] = world.config.world.block;
        const worldPos = Coords.sppToEngine([0, 0, 0], [block.x, block.y]);
        const minX = worldPos[0];
        const minZ = worldPos[2];

        // CRITICAL: Block group is placed at the origin of the block.
        const group = world.renderEngine.createGroup();
        world.renderEngine.setObjectPosition(group, minX, block.elevation || 0, minZ);
        world.renderEngine.setObjectUserData(group, "entityId", eid);
        world.renderEngine.setRaycastable(group, true);

        block.group = group;
        this.blockGroups.set(bKey, group);

        // Add Raycast Target
        world.addComponent<RaycastTargetComponent>(eid, "RaycastTargetComponent", {
            type: "block",
            metadata: { x: block.x, y: block.y },
            isHovered: false,
            distanceToCamera: Infinity
        });

        // 1. Process Adjuncts
        const adjunctsToInit: any[] = [];
        let animations: any[] = [];

        if (Array.isArray(block.adjuncts) && typeof block.adjuncts[0] === 'number') {
            const raw = block.adjuncts;
            block.elevation = raw[0];
            const rawAdjuncts = raw[2] || [];
            animations = raw[3] || [];
            block.animations = animations;

            rawAdjuncts.forEach((adjData: any) => {
                if (Array.isArray(adjData) && typeof adjData[0] === 'number') {
                    const typeId = adjData[0];
                    const instances = adjData[1];
                    const definition = this.adjunctRegistry.get(typeId);

                    if (definition) {
                        instances.forEach((rawInst: any[], idx: number) => {
                            const std = definition.attribute?.deserialize(rawInst);
                            if (std) {
                                if (typeof std.animate === 'number' && std.animate > 0) {
                                    const animIndex = std.animate - 1;
                                    std.animate = animations[animIndex] || null;
                                }

                                const adjId = world.createEntity();
                                adjunctsToInit.push({
                                    ...std,
                                    typeId,
                                    entityId: adjId,
                                    logicModule: definition,
                                    id: `adj_${block.x}_${block.y}_${typeId}_${idx}`
                                });

                                if (std.animate) {
                                    world.addComponent(adjId, "AnimationComponent", {
                                        config: std.animate,
                                        elapsedTime: 0,
                                        isPaused: false,
                                        loopCount: 0
                                    });
                                }
                            }
                        });
                    }
                }
            });
        } else {
            block.adjuncts.forEach((adjData: any) => {
                const adjId = world.createEntity();
                adjunctsToInit.push({ ...adjData, logicModule: AdjunctBox, entityId: adjId });
            });
        }

        const hasGround = adjunctsToInit.some(a => a.id?.startsWith('ground') || (a.typeId === 0x00a2 && a.oz < 0));

        if (!hasGround) {
            const [bw, bl] = world.config.world.block;
            const groundId = world.createEntity();
            const groundStd = {
                type: "box",
                x: bw, y: bl, z: 0.1,
                ox: bw / 2, oy: bl / 2, oz: -0.05,
                rx: 0, ry: 0, rz: 0
            };
            this.attachAdjunctComponents(world, eid, groundId, groundStd, AdjunctBox, `ground_${bKey}`);
        }

        adjunctsToInit.forEach((data) => {
            this.attachAdjunctComponents(world, eid, data.entityId, data, data.logicModule, data.id);
        });
    }

    private attachAdjunctComponents(world: World, blockEid: EntityId, adjId: EntityId, data: any, logic: any, id: string) {
        const block = world.getComponent<BlockComponent>(blockEid, "BlockComponent")!;

        const sppPos: [number, number, number] = [data.ox, data.oy, data.oz];
        const sppBlock: [number, number] = [block.x, block.y];
        const enginePos = Coords.sppToEngine(sppPos, sppBlock);

        enginePos[1] += (block.elevation || 0);

        world.addComponent<TransformComponent>(adjId, "TransformComponent", {
            position: enginePos,
            rotation: [data.rx || 0, data.ry || 0, data.rz || 0],
            scale: [1, 1, 1]
        });

        world.addComponent<AdjunctComponent>(adjId, "AdjunctComponent", {
            adjunctId: id,
            isInitialized: false,
            logicModule: logic,
            parentBlockEntityId: blockEid,
            stdData: data
        });

        const isSolid = data.type === 'box' || data.typeId === 0x00a2 || data.stop;
        if (isSolid) {
            world.addComponent<SolidComponent>(adjId, "SolidComponent", {
                shape: "box",
                size: Coords.getBoxDimensions([data.x, data.y, data.z]),
                offset: [0, 0, 0]
            });
        }
    }

    public syncVisibility(world: World, requiredKeys: string[]) {
        this.blockGroups.forEach((group, key) => {
            world.renderEngine.setObjectVisible(group, requiredKeys.includes(key));
        });
    }
}
