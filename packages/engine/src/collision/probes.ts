import type { Collider, CompiledBuilding, Point3, StairConnection } from '@refloor/engine/types';
import { distanceToBox } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import { collisionCandidates } from '@refloor/engine/collision/colliders';

export function blockingCollider(
  compiled: CompiledBuilding,
  point: Point3,
  doorPolicy: 'openable' | 'current' = 'openable',
  stair?: StairConnection,
): Collider | undefined {
  const profile = compiled.options;
  return collisionCandidates(compiled, point).find((collider) => {
    if (collider.entityId === stair?.id && collider.role !== 'stair-railing') return false;
    if (doorPolicy === 'openable' && collider.role === 'door') return false;
    const box = colliderBounds(collider);
    // Stair path heights interpolate between tread centres before the final landing riser.
    const lowerOffset =
      profile.stepHeight +
      (collider.role === 'slab' && collider.floorId === stair?.upper.floorId
        ? stair.riserHeight
        : 0);
    if (
      box.position.y + box.size.y / 2 <= point.y + lowerOffset + 1e-6 ||
      box.position.y - box.size.y / 2 >= point.y + profile.headroom - 1e-6
    )
      return false;
    return distanceToBox(point, box) < profile.radius + profile.clearance - 1e-6;
  });
}

export function standingBlocked(
  compiled: CompiledBuilding,
  point: Point3,
  doorPolicy: 'openable' | 'current' = 'openable',
): boolean {
  return blockingCollider(compiled, point, doorPolicy) !== undefined;
}
