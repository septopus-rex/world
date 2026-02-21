import { EntityId } from '../World';

/**
 * Represents a physical item in the 3D world that can be picked up.
 */
export interface ItemDropComponent {
    itemId: string;
    quantity: number;
    metadata?: any;

    // Animate the drop? (Bobbing up and down, rotating)
    bobTimer: number;
}
