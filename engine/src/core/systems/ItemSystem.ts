import { World, ISystem, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { ItemComponent } from '../components/ItemComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { getItemTemplate, itemIdFor } from '../services/ItemRegistry';
import { AdjunctFactory } from '../factories/AdjunctFactory';
import { saveBlockDraft } from '../utils/BlockSerializer';
import { Coords } from '../utils/Coords';
import { SystemMode } from '../types/SystemMode';

/** Clicks further than this never pick up (matches interaction feel, not physics). */
const PICKUP_RANGE = 8;

/**
 * ItemSystem — world↔inventory state transfer for b5 item adjuncts.
 *
 * Pickup (click via RaycastInteractionSystem's 'interact'):
 *   1. capacity pre-check — a full bag aborts with NO side effects
 *   2. pickup_item → InventorySystem credits the player's bag
 *   3. destroy the world entity (mesh + resources + components)
 *   4. re-serialize the block raw → DraftStore
 * Steps 2–4 run synchronously in one frame: the local-first version of the
 * chain design's "remove from Block + write to bag" atomic transaction
 * (spec: docs/plan/specs/inventory-local-first.md). Mode gating: Normal + Game
 * only — Edit is for authoring, Ghost is read-only.
 *
 * Drop (dropItem API, surfaced as Engine.dropItem): the exact reverse —
 * validate, debit the bag, append a b5 row to the player's current block,
 * spawn the live entity, persist the draft.
 */
export class ItemSystem implements ISystem {
    private world!: World;
    private _interactReader: import('../events/EventReader').EventReader<'interact.primary'> | null = null;

    public update(world: World, _dt: number): void {
        this.world = world;
        if (!this._interactReader && (world as any).events?.reader) {
            this._interactReader = world.events.reader('interact.primary');
        }
        if (!this._interactReader) return;

        if (world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost) {
            this._interactReader.clear();   // gated-away clicks never pick up
            return;
        }
        for (const ev of this._interactReader.read()) {
            this.onInteract(ev);
        }
    }

    // ── pickup ────────────────────────────────────────────────────────────────

    private onInteract(ev: any): void {
        const world = this.world;
        if (!world) return;

        const entityId = ev?.target;
        const playerId = ev?.actor;
        if (entityId == null || playerId == null) return;
        if ((ev.payload?.distance ?? 0) > PICKUP_RANGE) return;

        const item = world.getComponent<ItemComponent>(entityId, "ItemComponent");
        if (!item) return;
        const template = getItemTemplate(item.templateId);
        if (!template) {
            console.warn(`[ItemSystem] unknown item template ${item.templateId} — not picked up`);
            return;
        }

        // 1. Capacity pre-check (atomicity: bail BEFORE any state changes).
        const inventory = world.getComponent<InventoryComponent>(playerId, "InventoryComponent");
        if (!inventory) return;
        const itemId = itemIdFor(template, item.seed);
        const hasStack = inventory.items.some(i => i.id === itemId);
        if (!hasStack && inventory.items.length >= inventory.maxCapacity) {
            world.events.emit("inventory.full", { entity: playerId, itemId });
            return;
        }

        // 2. Credit the bag.
        world.events.emit("item.pickup", {
            itemId,
            amount: item.count,
            metadata: { templateId: item.templateId, seed: item.seed },
        }, { actor: playerId });

        // 3. Remove from the world.
        const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        const blockEid = adjunct?.parentBlockEntityId ?? null;
        const mesh = world.getComponent<MeshComponent>(entityId, "MeshComponent");
        if (mesh?.handle) {
            AdjunctFactory.releaseHandleResources(world, mesh.handle);
            world.renderEngine.removeHandle(mesh.handle);
        }
        world.destroyEntity(entityId);

        // 4. Persist: the block raw no longer contains this item.
        if (blockEid !== null) saveBlockDraft(world, blockEid);

        world.events.emit("item.picked", {
            itemId, templateId: item.templateId, seed: item.seed, count: item.count,
        }, { actor: playerId });
    }

    // ── drop ──────────────────────────────────────────────────────────────────

    /**
     * Drop `count` of an inventory item at the player's feet. Validates fully
     * before mutating anything; returns false (no side effects) on any miss.
     */
    public dropItem(world: World, playerId: EntityId, itemId: string, count: number = 1): boolean {
        if (world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost) return false;

        const inventory = world.getComponent<InventoryComponent>(playerId, "InventoryComponent");
        const entry = inventory?.items.find(i => i.id === itemId);
        if (!inventory || !entry || entry.quantity < count) return false;

        const templateId = entry.metadata?.templateId ?? ItemSystem.templateIdFromItemId(itemId);
        const seed = entry.metadata?.seed ?? 0;
        if (templateId == null || !getItemTemplate(templateId)) return false;

        const trans = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!trans) return false;
        const spp = Coords.engineToSpp(trans.position);

        // The player's current block must be live to receive the item.
        let blockEid: EntityId | null = null;
        for (const eid of world.queryEntities("BlockComponent")) {
            const b = world.getComponent<any>(eid, "BlockComponent");
            if (b && b.x === spp.block[0] && b.y === spp.block[1]) { blockEid = eid; break; }
        }
        const blockSystem = world.systems.findSystemByName('BlockSystem') as any;
        if (blockEid === null || !blockSystem?.spawnAdjunct) return false;

        // All checks passed — debit, spawn, persist (one frame, no awaits).
        world.events.emit("item.consume", { itemId, amount: count }, { actor: playerId });

        const rawRow = [
            [spp.pos[0], spp.pos[1], Math.max(0, spp.pos[2]) + 0.2],
            templateId, seed, count, [0, 0, 0],
        ];
        const spawned = blockSystem.spawnAdjunct(world, blockEid, 0x00b5, rawRow);
        if (spawned === null) {
            // Roll the debit back — never strand items in limbo.
            world.events.emit("item.pickup", { itemId, amount: count, metadata: entry.metadata }, { actor: playerId });
            return false;
        }
        saveBlockDraft(world, blockEid);

        world.events.emit("item.dropped", { itemId, templateId, seed, count }, { actor: playerId });
        return true;
    }

    /** `tpl_2` → 2, `itm_1_9347` → 1 (fallback when metadata is absent). */
    private static templateIdFromItemId(itemId: string): number | null {
        const m = /^(?:tpl|itm)_(\d+)/.exec(itemId);
        return m ? Number(m[1]) : null;
    }
}
