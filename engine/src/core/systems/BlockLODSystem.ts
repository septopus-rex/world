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
 * Config: `world.performance.lodNear` (metres). The DEFAULT is not a constant —
 * it is `world.metrics.streamingReach(extend)`, the same radius the fog goes
 * opaque at, so a block can only be hidden where it was already invisible.
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

        // Default = the SAME guaranteed streaming radius the fog closes at
        // (world.metrics.streamingReach — read it, it owns the argument). Coupling
        // them by construction is the point: a fixed 40 m default against a fog that
        // went opaque at 54 m meant adjuncts winked out at 40 m while still 40 %
        // visible, which is the same anisotropy bug in a second place. Hiding at
        // exactly `reach` is free — the fog is already 100 % there.
        const lodNear: number = (world.config as any)?.world?.performance?.lodNear
            ?? (world.config as any)?.performance?.lodNear
            ?? world.metrics.streamingReach((world.config as any)?.player?.extend ?? 2);
        const nearSq = lodNear * lodNear;
        const forceNear = world.mode === SystemMode.Edit;

        const live = new Set<EntityId>();
        for (const blockEid of world.queryEntities("BlockComponent")) {
            const block = world.getComponent<BlockComponent>(blockEid, "BlockComponent");
            if (!block || !block.isInitialized) continue;
            live.add(blockEid);

            // Distance to the block's NEAREST POINT, not its centre. A block is a
            // 16 m-wide volume: judging by the centre calls a block "far" while its
            // near edge is plainly in view (centre 32 m ⇒ edge 24 m) — and the
            // nearest point is also what the fog acts on, so this is the metric that
            // makes "hidden ⇒ already fogged out" true rather than approximately
            // true. Outer-ring DIAGONAL blocks do fall in the far tier at the
            // default lodNear, and that is correct now, not a hole: at `reach` the
            // fog is 100 %, so nothing that gets hidden was on screen. The window is
            // a PREFETCH square; the visible region is the disc inside it.
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
