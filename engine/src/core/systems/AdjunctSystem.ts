import { World, ISystem, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { Coords } from '../utils/Coords';
import { MeshFactory } from '../../render/MeshFactory';
import { RenderHandle } from '../types/Adjunct';
import { Color } from '../utils/Math';

export interface IAdjunctLogic {
    transform: {
        stdToRenderData?: (stds: any[], va: number) => any[];
        std_3d?: (stds: any[], va: number) => any[];
        createMesh?: (data: any) => RenderHandle;
    };
    menu?: {
        sidebar?: (params: any) => any;
    };
}

export class AdjunctSystem implements ISystem {
    private initializedAdjuncts: Set<EntityId> = new Set();

    public update(world: World, deltaTime: number): void {
        const adjunctEntities = world.queryEntities("AdjunctComponent");

        for (const entityId of adjunctEntities) {
            const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!adjunct || !transform) continue;

            const meshGroup = (adjunct as any)._mesh as RenderHandle;
            if (!adjunct.isInitialized) {
                this.initializeAdjunct(world, entityId, adjunct, transform);
            } else if (meshGroup) {
                // Sync Transform - Respect Hierarchy!
                const block = adjunct.parentBlockEntityId ? world.getComponent<any>(adjunct.parentBlockEntityId, "BlockComponent") : null;
                if (block && block.group) {
                    const blockWorldPos = Coords.sppToEngine([0, 0, 0], [block.x, block.y]);
                    const localX = transform.position[0] - blockWorldPos[0];
                    const localY = transform.position[1] - (block.elevation || 0);
                    const localZ = transform.position[2] - blockWorldPos[2];

                    world.renderEngine.setObjectPosition(meshGroup, localX, localY, localZ);
                } else {
                    world.renderEngine.setObjectPosition(meshGroup, transform.position[0], transform.position[1], transform.position[2]);
                }

                world.renderEngine.setObjectRotation(meshGroup, transform.rotation[0], transform.rotation[1], transform.rotation[2]);
                world.renderEngine.setObjectScale(meshGroup, transform.scale[0], transform.scale[1], transform.scale[2]);

                // Sync Material Overrides
                const anim = world.getComponent<any>(entityId, "AnimationComponent");
                if (anim && (anim.colorOverride !== undefined || anim.opacityOverride !== undefined)) {
                    world.renderEngine.updateObjectAppearance(meshGroup, anim.colorOverride, anim.opacityOverride);
                }
            }
        }
    }

    private initializeAdjunct(world: World, entityId: EntityId, adjunct: AdjunctComponent, transform: TransformComponent) {
        if (!adjunct.logicModule) return;

        const logic = adjunct.logicModule as IAdjunctLogic;
        const std = adjunct.stdData;

        // 1. Create Handle
        const block = adjunct.parentBlockEntityId ? world.getComponent<any>(adjunct.parentBlockEntityId, "BlockComponent") : null;
        const meshGroup = world.renderEngine.createGroup(block?.group);
        world.renderEngine.setObjectUserData(meshGroup, "entityId", entityId);

        // Position relative to parent block group
        const localPos = Coords.localSppToEngine([std.ox, std.oy, std.oz]);
        world.renderEngine.setObjectPosition(meshGroup, localPos[0], localPos[1], localPos[2]);
        world.renderEngine.setObjectRotation(meshGroup, transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        world.renderEngine.setObjectScale(meshGroup, transform.scale[0], transform.scale[1], transform.scale[2]);

        if (logic.transform) {
            let renderDataList: any[] = [];
            try {
                if (typeof logic.transform.stdToRenderData === 'function') {
                    renderDataList = logic.transform.stdToRenderData([std], 0);
                } else if (typeof logic.transform.std_3d === 'function') {
                    renderDataList = logic.transform.std_3d([std], 0);
                }

                for (const renderItem of renderDataList) {
                    if (!renderItem.hidden) {
                        let mesh: RenderHandle;
                        if (typeof logic.transform.createMesh === 'function') {
                            mesh = logic.transform.createMesh(renderItem);
                        } else {
                            // Fallback to unified MeshFactory
                            if (renderItem.type === 'box' && renderItem.params.position[2] < 0 && !renderItem.material?.color) {
                                let bx = 0, by = 0;
                                if (adjunct.parentBlockEntityId) {
                                    const b = world.getComponent<any>(adjunct.parentBlockEntityId, "BlockComponent");
                                    if (b) { bx = b.x; by = b.y; }
                                }
                                const hash = (bx * 71 + by * 131);
                                const h = ((hash % 100) + 100) % 100 / 100;
                                renderItem.material = {
                                    ...renderItem.material,
                                    color: new Color().setHSL(h, 0.5, 0.4).getHex()
                                };
                            }
                            mesh = MeshFactory.create(renderItem);
                        }

                        const subEnginePos = Coords.localSppToEngine(renderItem.params.position);
                        const relativePos = [
                            subEnginePos[0] - localPos[0],
                            subEnginePos[1] - localPos[1],
                            subEnginePos[2] - localPos[2]
                        ];

                        world.renderEngine.setObjectPosition(mesh, relativePos[0], relativePos[1], relativePos[2]);
                        world.renderEngine.setObjectRotation(mesh,
                            renderItem.params.rotation[0] || 0,
                            renderItem.params.rotation[1] || 0,
                            renderItem.params.rotation[2] || 0
                        );
                        world.renderEngine.addObjectToGroup(meshGroup, mesh);
                    }

                    // Trigger Handling
                    if (renderItem.triggerVolume) {
                        const vol = renderItem.triggerVolume;
                        const triggerTypeStr = vol.type === 1 ? 'in' : (vol.type === 2 ? 'out' : 'hold');
                        const events: any[] = [{
                            type: triggerTypeStr,
                            actions: (vol.logic || []).map((l: any) => ({
                                type: 'adjunct',
                                target: l[1]?.[1],
                                method: 'modify',
                                params: [l[1]]
                            })),
                            oneTime: vol.runOnce
                        }];

                        world.addComponent(entityId, "TriggerComponent", {
                            shape: vol.shape, size: vol.size, offset: vol.offset,
                            events, entitiesInside: new Set(), triggeredCount: {}, showHelper: false
                        });
                    }
                }

                // Add Raycast Target for selection
                world.addComponent<RaycastTargetComponent>(entityId, "RaycastTargetComponent", {
                    type: "adjunct",
                    metadata: {
                        index: adjunct.stdData.index,
                        name: adjunct.adjunctId
                    },
                    isHovered: false,
                    distanceToCamera: Infinity
                });
            } catch (error) {
                console.error(`[AdjunctSystem] Failed for ${adjunct.adjunctId}.`, error);
            }
        }

        (adjunct as any)._mesh = meshGroup;
        world.renderEngine.setRaycastable(meshGroup, true);
        adjunct.isInitialized = true;
        this.initializedAdjuncts.add(entityId);

        if (adjunct.parentBlockEntityId) {
            world.emitSimple("world:block_ready", { blockId: adjunct.parentBlockEntityId });
        }
    }
}
