import { World, ISystem, EntityId } from '../World';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, SolidComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { Coords } from '../utils/Coords';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctFactory } from '../factories/AdjunctFactory';
import { getBuiltinAdjunct } from '../services/AdjunctRegistry';
import { expandParticle } from '../spp/Expander';
import { RenderHandle } from '../types/Adjunct';

/**
 * BlockSystem handles the transition from standard Block data (std) 
 * to Engine instances (3d). It manages block Groups and ground generation.
 */
export class BlockSystem implements ISystem {
    private blockGroups: Map<string, RenderHandle> = new Map();

    // Native adjunct dispatch is sourced from the shared AdjunctRegistry
    // (getBuiltinAdjunct) so block init and dynamic resolution share one map.

    /**
     * Max blocks initialized per frame. When a whole neighbourhood streams in at
     * once, building every block (entities + adjunct components + group) in one
     * frame stalls; budgeting spreads it across frames (frame-split loading).
     * The per-adjunct MESH build is separately budgeted by AdjunctSystem.
     */
    private static readonly BUILD_BUDGET = 4;

    public update(world: World, dt: number): void {
        const blockEntities = world.queryEntities("BlockComponent");

        let built = 0;
        for (const eid of blockEntities) {
            const block = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (!block || block.isInitialized) continue;

            this.initializeBlock(world, eid, block);
            block.isInitialized = true;
            if (++built >= BlockSystem.BUILD_BUDGET) break; // rest of the queue next frame
        }
    }

    private initializeBlock(world: World, eid: EntityId, block: BlockComponent) {
        const bKey = `${block.x}_${block.y}`;
        if (this.blockGroups.has(bKey)) return;

        // Check for localStorage draft — if exists, use draft data instead of chain data
        const worldId = typeof block.world === 'number' ? block.world : 0;
        const draft = world.draftStore.load(worldId, block.x, block.y);
        if (draft) {
            console.log(`[BlockSystem] Loading draft for block ${bKey}`);
            block.adjuncts = draft.raw;
            block.isDraft = true;
        }

        const [bw, bl] = world.config.world.block;
        const worldPos = Coords.sppToEngine([0, 0, 0], [block.x, block.y]);
        const minX = worldPos[0];
        const minZ = worldPos[2];

        // CRITICAL: Block group is placed at the origin of the block.
        const group = world.renderEngine.createGroup();
        world.renderEngine.setObjectPosition(group, minX, block.elevation || 0, minZ);
        world.renderEngine.setObjectUserData(group, "entityId", eid);
        world.renderEngine.setRaycastable(group, true);

        // Attach MeshComponent
        world.addComponent<MeshComponent>(eid, "MeshComponent", {
            handle: group
        });

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
        const meshComp = world.getComponent<MeshComponent>(eid, "MeshComponent");

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
                    const definition = getBuiltinAdjunct(typeId);

                    if (definition) {
                        instances.forEach((rawInst: any[], idx: number) => {
                            const std = definition.attribute?.deserialize(rawInst);
                            if (std) {
                                if (typeof std.animate === 'number' && std.animate > 0) {
                                    const animIndex = std.animate - 1;
                                    std.animate = animations[animIndex] || null;
                                }

                                const adjId = world.createEntity();
                                const sourceId = `adj_${block.x}_${block.y}_${typeId}_${idx}`;
                                adjunctsToInit.push({
                                    ...std,
                                    typeId,
                                    entityId: adjId,
                                    logicModule: definition,
                                    id: sourceId
                                });

                                // SPP (b6): expand the particle into STANDARD adjunct
                                // rows — every piece is its own entity (collision /
                                // triggers / LOD all native). Pieces carry derivedFrom
                                // so BlockSerializer persists only the b6 source.
                                if (typeId === 0x00b6) {
                                    expandParticle(rawInst as any).forEach(([dType, dRow], k) => {
                                        const dDef = getBuiltinAdjunct(dType);
                                        const dStd = dDef?.attribute?.deserialize(dRow);
                                        if (!dDef || !dStd) return;
                                        adjunctsToInit.push({
                                            ...dStd,
                                            typeId: dType,
                                            entityId: world.createEntity(),
                                            logicModule: dDef,
                                            id: `${sourceId}_d${k}`,
                                            derivedFrom: sourceId,
                                        });
                                    });
                                }

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

        // block.loaded gate: ONE event when the LAST adjunct mesh is built
        // (AdjunctSystem decrements; replaces the per-adjunct world:block_ready).
        const total = adjunctsToInit.length + (hasGround ? 0 : 1);
        block.pendingAdjuncts = total;
        block.adjunctTotal = total;
    }

    /**
     * Runtime-add ONE adjunct to an already-initialized block (item drop, etc.).
     * Deserializes the raw row via the registry and attaches the standard
     * component set; AdjunctSystem builds the mesh on the next frame. The caller
     * persists (saveBlockDraft) — this only mutates the live world.
     */
    public spawnAdjunct(world: World, blockEid: EntityId, typeId: number, rawRow: any[]): EntityId | null {
        const block = world.getComponent<BlockComponent>(blockEid, "BlockComponent");
        const definition = getBuiltinAdjunct(typeId);
        const std = definition?.attribute?.deserialize?.(rawRow);
        if (!block || !definition || !std) return null;

        // Next free index of this type within the block → stable-ish adjunctId.
        let idx = 0;
        for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
            const a = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (a && a.parentBlockEntityId === blockEid && (a.stdData?.typeId ?? -1) === typeId) idx++;
        }

        const adjId = world.createEntity();
        const sourceId = `adj_${block.x}_${block.y}_${typeId}_${idx}`;
        this.attachAdjunctComponents(world, blockEid, adjId, { ...std, typeId }, definition, sourceId);

        // SPP (b6): expand into standard derived pieces immediately so a palette-
        // placed cell is visible without a reload (block-load does the same).
        if (typeId === 0x00b6) {
            this.expandParticleInto(world, blockEid, sourceId, rawRow);
        }
        return adjId;
    }

    /** Expand a b6 source row into standard derived adjunct entities (a1/b8),
     *  each tagged derivedFrom the source so BlockSerializer persists only the
     *  source. Shared by palette placement and live re-expansion on edit. */
    private expandParticleInto(world: World, blockEid: EntityId, sourceId: string, rawRow: any[]): void {
        expandParticle(rawRow as any).forEach(([dType, dRow], k) => {
            const dDef = getBuiltinAdjunct(dType);
            const dStd = dDef?.attribute?.deserialize?.(dRow);
            if (!dDef || !dStd) return;
            const dId = world.createEntity();
            this.attachAdjunctComponents(
                world, blockEid, dId,
                { ...dStd, typeId: dType, derivedFrom: sourceId },
                dDef, `${sourceId}_d${k}`
            );
        });
    }

    /** Destroy every derived piece of a b6 source (free meshes + resources). */
    public destroyDerived(world: World, sourceAdjunctId: string): void {
        for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
            const a = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (a?.stdData?.derivedFrom === sourceAdjunctId) {
                this.releaseResources(world, eid);
                this.freeMesh(world, eid);
                world.destroyEntity(eid);
            }
        }
    }

    /** Re-expand a b6 source after its cells changed (edit): drop the old derived
     *  pieces and rebuild from the source's current stdData. AdjunctSystem builds
     *  the new meshes next frame. */
    public reexpandParticle(world: World, sourceEid: EntityId): void {
        const src = world.getComponent<AdjunctComponent>(sourceEid, "AdjunctComponent");
        if (!src || (src.stdData?.typeId ?? -1) !== 0x00b6) return;
        if (src.parentBlockEntityId == null) return;
        this.destroyDerived(world, src.adjunctId);
        const raw = getBuiltinAdjunct(0x00b6)?.attribute?.serialize?.(src.stdData);
        if (raw) this.expandParticleInto(world, src.parentBlockEntityId, src.adjunctId, raw as any[]);
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

    /**
     * Destroy a block and all its adjuncts, freeing their render handles.
     * Resets the block so it can be re-streamed if the player returns.
     */
    public removeBlock(world: World, x: number, y: number): void {
        const bKey = `${x}_${y}`;
        let blockEid: EntityId | null = null;
        for (const eid of world.queryEntities("BlockComponent")) {
            const b = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (b && b.x === x && b.y === y) { blockEid = eid; break; }
        }
        if (blockEid === null) return;

        // Destroy child adjuncts (free their meshes first).
        for (const aid of world.getEntitiesWith(["AdjunctComponent"])) {
            const a = world.getComponent<AdjunctComponent>(aid, "AdjunctComponent");
            if (a && a.parentBlockEntityId === blockEid) {
                this.releaseResources(world, aid);
                this.freeMesh(world, aid);
                world.destroyEntity(aid);
            }
        }
        // Destroy the block group + entity.
        this.freeMesh(world, blockEid);
        world.destroyEntity(blockEid);
        this.blockGroups.delete(bKey);
    }

    private freeMesh(world: World, eid: EntityId): void {
        const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent");
        if (mesh?.handle) world.renderEngine.removeHandle(mesh.handle);
    }

    /**
     * Release the model + texture resources an adjunct instanced, so the shared
     * template/texture ref-counts drop and the underlying file is freed when it
     * hits 0. Ties resource dedup into block eviction (bounded memory as the player
     * roams). Shares one helper with edit-mode teardown (AdjunctFactory).
     */
    private releaseResources(world: World, eid: EntityId): void {
        const handle = world.getComponent<MeshComponent>(eid, "MeshComponent")?.handle;
        if (handle) AdjunctFactory.releaseHandleResources(world, handle);
    }

    public syncVisibility(world: World, requiredKeys: string[]) {
        // Simplified for refactor: find all BlockComponents and update their MeshComponent visibility
        const blockEntities = world.queryEntities("BlockComponent");
        for (const eid of blockEntities) {
            const block = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (!block) continue;
            const bKey = `${block.x}_${block.y}`;
            const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent");
            if (mesh) {
                mesh.visible = requiredKeys.includes(bKey);
            }
        }
    }
}
