/**
 * ItemComponent — a pickable world item, backed by a b5 item adjunct.
 * The instance carries only identity data; rarity/attributes derive from
 * (templateId, seed) via ItemRegistry.deriveItemAttributes (pure).
 */
export interface ItemComponent {
    templateId: number;
    seed: number;
    count: number;
}
