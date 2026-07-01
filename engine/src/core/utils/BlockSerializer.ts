import { World, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { BlockComponent } from '../components/BlockComponent';
import { normalizeBlockRaw, AdjunctGroup } from '../protocol/BlockRaw';

/** The instance ordinal within its type-group, parsed from the trailing `_{idx}`
 *  of an adjunctId (`adj_{x}_{y}_{typeId}_{idx}`). This is the AUTHORED order and
 *  is load-bearing — triggers/references address adjuncts by this id — so sorting
 *  by it recovers authored order regardless of entity-iteration order. */
function parseAdjIndex(id: string | undefined): number {
    if (typeof id !== 'string') return 0;
    const m = id.match(/_(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
}

/**
 * Re-serialize a block's LIVE adjunct entities back into block raw format
 * [elevation, status, adjunctsRaw, animations, game] via each adjunct's
 * logicModule.attribute.serialize. raw[4] is the block-level game-zone flag
 * (BlockComponent.game) — it round-trips so an authored playable block stays
 * playable across a save/reload (and, eventually, on-chain).
 *
 * Shared by EditSystem (save-on-exit-edit) and ItemSystem (atomic pickup/drop)
 * — any runtime mutation that must survive a reload funnels through here into
 * the DraftStore.
 *
 * Note: the auto-generated ground plate (id `ground_*`, added by BlockSystem
 * when a block has no ground) is skipped — it is derived, not authored content,
 * and re-serializing it would double it up on the next load.
 */
export function serializeBlockToRaw(world: World, blockEntityId: EntityId): any[] | null {
    const block = world.getComponent<BlockComponent>(blockEntityId, "BlockComponent");
    if (!block) return null;

    const grouped = new Map<number, Array<{ idx: number; raw: any }>>();
    for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
        const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
        if (!adj || adj.parentBlockEntityId !== blockEntityId) continue;
        if (typeof adj.adjunctId === 'string' && adj.adjunctId.startsWith('ground')) continue;
        // SPP expansion products: only the b6 SOURCE row persists — baking the
        // derived pieces would freeze the particle into loose parts.
        if ((adj.stdData as any)?.derivedFrom) continue;

        const typeId = adj.stdData.typeId ?? AdjunctType.Box;
        const serialize = adj.logicModule?.attribute?.serialize;
        if (!serialize) continue;

        if (!grouped.has(typeId)) grouped.set(typeId, []);
        grouped.get(typeId)!.push({ idx: parseAdjIndex(adj.adjunctId), raw: serialize(adj.stdData) });
    }

    // Deterministic output: instances by authored idx within a group; groups by
    // typeId (via normalizeBlockRaw) → stable bytes → stable CID (spec D3).
    const adjunctsRaw: AdjunctGroup[] = [];
    grouped.forEach((rows, typeId) => {
        rows.sort((a, b) => a.idx - b.idx);
        adjunctsRaw.push([typeId, rows.map((r) => r.raw)]);
    });

    return normalizeBlockRaw([
        block.elevation || 0,
        1, // status: active
        adjunctsRaw,
        block.animations || [],
        block.game || 0, // raw[4]: game-zone flag (playable block)
    ]);
}

/** Serialize + persist a block to the DraftStore and mark it as a draft. */
export function saveBlockDraft(world: World, blockEntityId: EntityId): boolean {
    const block = world.getComponent<BlockComponent>(blockEntityId, "BlockComponent");
    const raw = serializeBlockToRaw(world, blockEntityId);
    if (!block || !raw) return false;

    const worldId = typeof block.world === 'number' ? block.world : 0;
    world.draftStore.save(worldId, block.x, block.y, raw);
    block.isDraft = true;
    world.events.emit("edit.draft_saved", { blockKey: `${block.x}_${block.y}` });
    return true;
}
