import { RenderHandle } from '../types/Adjunct';

/**
 * MeshComponent identifies an entity that has a 3D representation in the RenderEngine.
 */
export interface MeshComponent {
    handle: RenderHandle;
    /**
     * Optional settings for how this mesh should be synced
     */
    syncScale?: boolean;
    syncRotation?: boolean;
    syncRotationAxes?: [boolean, boolean, boolean];
    visible?: boolean;
}
