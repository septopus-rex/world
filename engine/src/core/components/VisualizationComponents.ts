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
    /** Runtime appearance override (gameplay highlight / state colour / dimming),
     *  set via core/utils/Appearance. VisualSyncSystem pushes it onto the handle
     *  on each dirty sync (isolated per-object so it never bleeds across shared
     *  cached materials). Distinct from SPP AnimationComponent overrides. */
    colorOverride?: number;
    opacityOverride?: number;
}
