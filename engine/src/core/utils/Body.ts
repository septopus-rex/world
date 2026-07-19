import { TransformComponent, RigidBodyComponent } from '../components/PlayerComponents';

/**
 * Y of a body's FEET.
 *
 * `TransformComponent.position` is the collision capsule's **centre** — that is
 * the convention every physics site works in (`MovementCollider` /
 * `PhysicsSystem` derive the extremes as `position + offset ± size/2`, and land
 * the body by writing `top + size[1]/2 - offset[1]` back into position).
 *
 * Anything measured from the GROUND up — camera eye height, chest anchors,
 * planting a model's feet — must therefore drop the half-height first. Adding
 * such a height straight onto `position` puts it half a body too high, which is
 * exactly the bug this helper exists to prevent: a declared eyeHeight of 1.7 m
 * (protocol player.md §3.1 — measured from the feet, clamped to ≤ the avatar's
 * height) landed the first-person camera at 2.6 m on a 1.8 m body.
 */
export function feetY(trans: TransformComponent, body?: RigidBodyComponent | null): number {
    return body ? trans.position[1] + body.offset[1] - body.size[1] / 2 : trans.position[1];
}
