import { ItemCategory, ItemTemplate, registerItemTemplate } from '../services/ItemRegistry';

/**
 * DEMO item templates — mock CONTENT, not engine vocabulary (same status as
 * BlockMocks / WorldConfigs). Item templates are world content: a host registers
 * its own catalogue via `registerItemTemplate`; the engine ships none by default.
 * These three exist for the demo scenes / tests (b5 rows reference ids 1–3).
 *
 * Derivation contract (PRNG, rarity roll, attribute order):
 * protocol/{cn,en}/item.md — normative, cross-engine.
 */
export const DEMO_ITEM_TEMPLATES: ItemTemplate[] = [
    {
        id: 1, name: 'Gem', category: ItemCategory.Collectible, stackable: 0,
        visual: { shape: 'sphere', size: [0.4, 0.4, 0.4], color: 0x22ccee },
        attributes: [
            { name: 'magic', baseRange: [10, 50], rarityScale: 0.5 },
            { name: 'luster', baseRange: [20, 90], rarityScale: 0.2 },
        ],
        rarityWeights: [50, 25, 15, 8, 2],
    },
    {
        id: 2, name: 'Key', category: ItemCategory.Key, stackable: 9,
        visual: { shape: 'box', size: [0.3, 0.3, 0.6], color: 0xeebb33 },
        attributes: [],
        rarityWeights: [1],
    },
    {
        id: 3, name: 'Potion', category: ItemCategory.Consumable, stackable: 5,
        visual: { shape: 'cone', size: [0.35, 0.35, 0.5], color: 0xdd3355 },
        attributes: [{ name: 'heal', baseRange: [5, 25], rarityScale: 0.4 }],
        rarityWeights: [70, 30],
    },
];

/** Register the demo catalogue (idempotent). Hosts with real content skip this. */
export function registerDemoItemTemplates(): void {
    for (const t of DEMO_ITEM_TEMPLATES) registerItemTemplate(t);
}
