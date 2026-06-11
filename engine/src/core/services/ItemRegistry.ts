/**
 * ItemRegistry — item templates + deterministic attribute derivation.
 *
 * The local-first inventory keeps the chain-era design's best idea: an item
 * instance stores only `{templateId, seed}`; rarity and attributes are DERIVED
 * by a pure seeded function, so every client computes identical values and
 * nothing derivable is ever persisted (or forgeable).
 * Spec: docs/plan/specs/inventory-local-first.md.
 */

export enum ItemCategory {
    Material = 0,
    Consumable = 1,
    Equipment = 2,
    Key = 3,
    Collectible = 4,
}

export enum Rarity {
    Common = 0,
    Uncommon = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
}

export interface AttributeRule {
    name: string;                    // 'magic', 'luster', ...
    baseRange: [number, number];     // base roll range
    rarityScale: number;             // multiplier per rarity tier
}

export interface ItemTemplate {
    id: number;
    name: string;
    category: ItemCategory;
    /** 0 = unique (identity includes seed, never stacks); >0 = stack limit per slot. */
    stackable: number;
    /** In-world rendering (b5 adjunct): shape + SPP-order size (m) + base color. */
    visual: { shape: 'box' | 'sphere' | 'cone'; size: [number, number, number]; color: number };
    attributes: AttributeRule[];
    /** Probability weights for Common..Legendary (normalized at derivation). */
    rarityWeights: number[];
}

export interface DerivedAttributes {
    rarity: Rarity;
    attributes: Record<string, number>;
}

// ── deterministic RNG (no Math.random / wall clock — step-test safe) ─────────

/** mulberry32 — tiny seeded PRNG, identical sequence for identical seed. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Derive rarity + attributes from a seed. Pure: same (template, seed) → same result. */
export function deriveItemAttributes(template: ItemTemplate, seed: number): DerivedAttributes {
    const rng = mulberry32(seed);

    const weights = template.rarityWeights.length > 0 ? template.rarityWeights : [1];
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    let roll = rng() * (total || 1);
    let rarity: Rarity = Rarity.Common;
    for (let i = 0; i < weights.length; i++) {
        roll -= Math.max(0, weights[i]);
        if (roll < 0) { rarity = i as Rarity; break; }
    }

    const attributes: Record<string, number> = {};
    for (const rule of template.attributes) {
        const base = rule.baseRange[0] + rng() * (rule.baseRange[1] - rule.baseRange[0]);
        attributes[rule.name] = Math.floor(base * (1 + rarity * rule.rarityScale));
    }
    return { rarity, attributes };
}

/**
 * Inventory identity for an item instance:
 *   stackable templates merge by template (`tpl_2` — five keys are one stack);
 *   unique templates carry their seed (`itm_1_9347` — every gem is itself).
 */
export function itemIdFor(template: ItemTemplate, seed: number): string {
    return template.stackable > 0 ? `tpl_${template.id}` : `itm_${template.id}_${seed >>> 0}`;
}

/** Deterministic display tint: rarity brightens the template color toward white. */
export function rarityColor(baseColor: number, rarity: Rarity): number {
    const k = Math.min(1, rarity * 0.18);
    const r = (baseColor >> 16) & 0xff, g = (baseColor >> 8) & 0xff, b = baseColor & 0xff;
    const up = (c: number) => Math.min(255, Math.round(c + (255 - c) * k));
    return (up(r) << 16) | (up(g) << 8) | up(b);
}

// ── registry ─────────────────────────────────────────────────────────────────

const templates = new Map<number, ItemTemplate>();

export function registerItemTemplate(template: ItemTemplate): void {
    templates.set(template.id, template);
}

export function getItemTemplate(id: number): ItemTemplate | undefined {
    return templates.get(id);
}

/** Built-in demo templates (world content can register more). */
export const BUILTIN_ITEM_TEMPLATES: ItemTemplate[] = [
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

for (const t of BUILTIN_ITEM_TEMPLATES) registerItemTemplate(t);
