import { World, EntityId } from '../World';
import { getAdjunct } from '../services/AdjunctRegistry';
import { AdjunctComponent } from '../components/AdjunctComponents';

/**
 * spawnRelative — the ONE runtime-spawn path (F1 spec §2.3), shared by the
 * actuator `spawn` action and SpawnerSystem.
 *
 * The template rawRow's position slot is RELATIVE to the anchor (the firing
 * trigger / the spawner). The shift is done GENERICALLY through the type's own
 * std round-trip (deserialize → shift ox/oy/oz → serialize) — no per-type
 * knowledge of which raw slot holds the position, so ANY adjunct type can be
 * spawned. The entity is tagged derivedFrom the anchor: BlockSerializer skips
 * it (never baked into a draft) and it dies with the block.
 */
export function spawnRelative(
    world: World,
    blockEid: EntityId,
    typeId: number,
    rawRow: any[],
    anchorStd: { ox?: number; oy?: number; oz?: number } | null | undefined,
    derivedFrom: string,
): { entityId: EntityId; adjunctId: string } | null {
    const def = getAdjunct(typeId);
    const std = def?.attribute?.deserialize?.(rawRow);
    if (!def?.attribute?.serialize || !std) return null;

    std.ox = (std.ox ?? 0) + (anchorStd?.ox ?? 0);
    std.oy = (std.oy ?? 0) + (anchorStd?.oy ?? 0);
    std.oz = (std.oz ?? 0) + (anchorStd?.oz ?? 0);
    const shifted = def.attribute.serialize(std);
    if (!shifted) return null;

    // world.blocks is a narrow facade (syncVisibility only) — resolve the real
    // BlockSystem for the spawn primitive.
    const blocks: any = world.systems.findSystemByName('BlockSystem');
    const eid = blocks?.spawnAdjunct?.(world, blockEid, typeId, shifted, { derivedFrom });
    if (eid == null) return null;
    const a = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
    return { entityId: eid, adjunctId: String(a?.adjunctId ?? '') };
}
