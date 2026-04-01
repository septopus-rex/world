import { EntityId, World } from '../World';
import { STDObject } from '../types/Adjunct';

/**
 * Component representing a dynamic, external "Adjunct" in the SPP Engine.
 * Adjuncts act as data-driven bridges for creating complex 3D interactive objects.
 */
export interface AdjunctComponent {
    adjunctId: string;
    stdData: STDObject;
    isInitialized: boolean;
    // We hold a reference to the specific Plugin module that handles the `transform` and `menu` logic for this adjunct type.
    logicModule: any | null;
    parentBlockEntityId?: EntityId; // Reference to the block this adjunct belongs to
}
