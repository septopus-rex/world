import { EntityId } from '../World';

export interface InventoryItem {
    id: string;      // Unique item identifier (e.g. 'gold_coin', 'wood_block', or an adjunct hash)
    quantity: number;
    metadata?: any;  // Optional custom data for the item
}

export interface InventoryComponent {
    items: InventoryItem[];
    maxCapacity: number; // Enforced by the King's WorldConfig
}
