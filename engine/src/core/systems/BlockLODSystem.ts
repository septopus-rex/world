import { World, ISystem, EntityId } from '../World';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { SystemMode } from '../types/SystemMode';

/**
 * BlockLODSystem — visual level-of-detail for streamed blocks.
 *
 * Two tiers: blocks whose center is within `lodNear` metres of the player show
 * everything; beyond it their adjunct mesh GROUPS are hidden (the ground plate
 * stays, so distant terrain reads as terrain instead of vanishing islands).
 * Group-level visibility preserves per-child flags — invisible touch volumes
 * stay invisible when a block returns to the near tier.
 *
 * SIMULATION IS UNTOUCHED: physics, triggers and items keep running for far
 * blocks — this trims draw calls, not behaviour. Eviction (streaming window)
 * still bounds memory; LOD bounds the renderer between those two radii.
 *
 * Edit mode forces everything near (you edit what you can see).
 *
 * Config: `world.performance.lodNear` (metres, default 40).
 * InstancedMesh batching was evaluated and deferred — see
 * docs/architecture/performance.md.
 */
export class BlockLODSystem implements ISystem {
    /** Re-evaluate every N seconds — tier flips are rare relative to frames. */
    private static readonly CHECK_INTERVAL = 0.25;

    private _elapsed = 0;
    private _tiers = new Map<EntityId, 'near' | 'far'>();

    public update(world: World, dt: number): void {
        this._elapsed += dt;
        if (this._elapsed < BlockLODSystem.CHECK_INTERVAL) return;
        this._elapsed = 0;

        const players = world.queryEntities("TransformComponent", "InputStateComponent");
        if (players.length === 0) return;
        const player = world.getComponent<TransformComponent>(players[0], "TransformComponent");
        if (!player) return;

        const lodNear: number = (world.config as any)?.world?.performance?.lodNear
            ?? (world.config as any)?.performance?.lodNear ?? 40;
        const nearSq = lodNear * lodNear;
        const forceNear = world.mode === SystemMode.Edit;

        const live = new Set<EntityId>();
        for (const blockEid of world.queryEntities("BlockComponent")) {
            const block = world.getComponent<BlockComponent>(blockEid, "BlockComponent");
            if (!block || !block.isInitialized) continue;
            live.add(blockEid);

            // Distance to the block's NEAREST POINT, not its centre. A block is a
            // 16 m-wide volume: judging by the centre calls a block "far" while its
            // near edge is plainly in view (centre 32 m ⇒ edge 24 m). Worse, with a
            // SQUARE streaming window the centre metric is anisotropic — corner
            // centres sit √2× further than orthogonal ones (45.3 m vs 32 m), so
            // lodNear=40 hid exactly the four corners and nothing else, carving an
            // "井"-shaped hole in the window. Clamping per axis to the block's AABB
            // makes the tier depend on visible proximity, and the boundary it draws
            // follows the window's shape instead of cutting across it.
            const centre = world.metrics.blockCentre(block.x, block.y);
            const dx = Math.max(0, Math.abs(player.position[0] - centre[0]) - world.metrics.blockWidth / 2);
            const dz = Math.max(0, Math.abs(player.position[2] - centre[2]) - world.metrics.blockLength / 2);
            const tier: 'near' | 'far' = (forceNear || dx * dx + dz * dz <= nearSq) ? 'near' : 'far';

            // 'far' is re-applied every check (idempotent): adjunct meshes are
            // built frame-split and a late mesh would otherwise pop in visible.
            if (tier === 'near' && this._tiers.get(blockEid) === 'near') continue;
            this._tiers.set(blockEid, tier);
            this.applyTier(world, blockEid, tier);
        }
        // Evicted blocks: drop their tier records (eids never come back).
        for (const eid of this._tiers.keys()) {
            if (!live.has(eid)) this._tiers.delete(eid);
        }
    }

    private applyTier(world: World, blockEid: EntityId, tier: 'near' | 'far'): void {
        const visible = tier === 'near';
        for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
            const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (!adj || adj.parentBlockEntityId !== blockEid) continue;
            // Ground stays: it IS the far-tier representation.
            if (typeof adj.adjunctId === 'string' && adj.adjunctId.startsWith('ground')) continue;
            const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent");
            if (mesh?.handle) world.renderEngine.setObjectVisible(mesh.handle, visible);
        }
    }
}
