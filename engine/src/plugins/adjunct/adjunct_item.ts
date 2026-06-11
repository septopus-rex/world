import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';
import { getItemTemplate, deriveItemAttributes, rarityColor } from '../../core/services/ItemRegistry.js';

/**
 * Item adjunct (b5) — a pickable item placed in a block.
 *
 * Raw row: [ pos, templateId, seed, count, rot ]
 *   pos        [x,y,z] SPP, relative to the block origin
 *   templateId ItemRegistry template (visuals + attribute rules live there)
 *   seed       deterministic attribute derivation (0 = no random attributes)
 *   count      quantity, default 1
 *   rot        optional [x,y,z]
 *
 * Visuals come from the TEMPLATE (shape/size/color, rarity-tinted) — raw stays
 * minimal and every placement of a template looks consistent.
 * Spec: docs/plan/specs/inventory-local-first.md.
 */
export const ItemMeta: ComponentMeta = {
    name: "item",
    short: "IT",
    typeId: 0x00b5,
    desc: "Pickable world item (template + seed)",
    version: "1.0.0"
};

export const ItemTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        return stds.map((row, index) => {
            const template = getItemTemplate(row.templateId);
            const visual = template?.visual ?? { shape: 'box' as const, size: [0.4, 0.4, 0.4] as [number, number, number], color: 0xaaaaaa };
            const { rarity } = template
                ? deriveItemAttributes(template, row.seed ?? 0)
                : { rarity: 0 as any };

            const renderObj: RenderObject & { itemPickup?: any } = {
                type: visual.shape,
                index,
                params: {
                    size: Coords.getBoxDimensions(visual.size),
                    position: [row.ox, row.oy, row.oz],
                    rotation: [row.rx ?? 0, row.ry ?? 0, row.rz ?? 0],
                },
                material: { color: rarityColor(visual.color, rarity) },
            };
            // Picked up by AdjunctSystem → ItemComponent (same pass-through
            // pattern as adjunct_trigger's triggerVolume).
            renderObj.itemPickup = {
                templateId: row.templateId,
                seed: row.seed ?? 0,
                count: row.count ?? 1,
            };
            return renderObj;
        });
    }
};

export const ItemMenu = {
    sidebar: (std: STDObject) => ({
        item: [
            { type: "number", key: "templateId", value: std.templateId, label: "Template", desc: "ItemRegistry template id" },
            { type: "number", key: "seed", value: std.seed, label: "Seed", desc: "Attribute derivation seed" },
            { type: "number", key: "count", value: std.count, label: "Count", desc: "Quantity" },
        ],
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X Offset" },
            { type: "number", key: "oy", value: std.oy, label: "Y Offset" },
            { type: "number", key: "oz", value: std.oz, label: "Z Offset" },
        ],
    })
};

export const ItemAttribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => {
        const templateId = data[1] ?? 1;
        // STD size mirrors the template visual (selection helpers / edit UI);
        // it is DERIVED — serialize() never writes it back into raw.
        const size = getItemTemplate(templateId)?.visual.size ?? [0.4, 0.4, 0.4];
        return {
            x: size[0], y: size[1], z: size[2],
            ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
            templateId,
            seed: data[2] ?? 0,
            count: data[3] ?? 1,
            rx: data[4]?.[0] ?? 0, ry: data[4]?.[1] ?? 0, rz: data[4]?.[2] ?? 0,
        };
    },
    serialize: (std: STDObject) => [
        [std.ox, std.oy, std.oz],
        std.templateId ?? 1,
        std.seed ?? 0,
        std.count ?? 1,
        [std.rx ?? 0, std.ry ?? 0, std.rz ?? 0],
    ]
};

export const AdjunctItem: AdjunctDefinition = {
    hooks: {
        reg: () => ItemMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: ItemTransform,
    attribute: ItemAttribute,
    menu: ItemMenu as any,
};
