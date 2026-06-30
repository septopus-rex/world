import { World, EntityId } from '../World';
import { MeshComponent } from '../components/VisualizationComponents';
import { TransformComponent } from '../components/PlayerComponents';

/**
 * Appearance — the ergonomic runtime-recolour seam for gameplay Systems.
 *
 * Box/sphere colour is BAKED at mesh build from the resource palette / material,
 * so until now a System that wanted to change an adjunct's colour at runtime
 * (selection highlight, hit flash, dead-piece dimming) had no clean path — pool
 * and mahjong both worked around it (bake at spawn / destroy+respawn on flip).
 *
 * This closes that gap: set a colour/opacity override on the entity's
 * MeshComponent and mark its transform dirty; VisualSyncSystem pushes it to the
 * render handle on the next sync (RenderEngine.updateObjectAppearance), isolating
 * the material per-object so recolouring one adjunct never bleeds into others
 * sharing its cached palette material. Safe no-op before the mesh exists (the
 * handle/MeshComponent appears one AdjunctSystem pass after spawn).
 *
 * Data-driven on purpose: the override lives on a component (headless-assertable,
 * dirty-gated), not a direct renderEngine call from core.
 */
export function setEntityColor(world: World, eid: EntityId, color: number): void {
    const mesh = world.getComponent<MeshComponent>(eid, 'MeshComponent');
    if (!mesh) return;
    mesh.colorOverride = color;
    markDirty(world, eid);
}

export function setEntityOpacity(world: World, eid: EntityId, opacity: number): void {
    const mesh = world.getComponent<MeshComponent>(eid, 'MeshComponent');
    if (!mesh) return;
    mesh.opacityOverride = opacity;
    markDirty(world, eid);
}

function markDirty(world: World, eid: EntityId): void {
    const t = world.getComponent<TransformComponent>(eid, 'TransformComponent');
    if (t) t.dirty = true;
}
