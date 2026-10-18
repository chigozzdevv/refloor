import { boxPolygon, boxesOverlap, polygonsOverlap, rectPolygon } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import { checkDoorClearance } from '@refloor/engine/validation/door-clearance';
import { checkStairClearance } from '@refloor/engine/validation/stair-clearance';
import type { CompiledBuilding, EngineIssue } from '@refloor/engine/types';

export function checkClearance(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [],
    profile = compiled.options;
  for (const [index, instance] of compiled.instances.entries()) {
    const bounds = instance.collider,
      object = instance.object;
    for (const other of compiled.instances.slice(0, index))
      if (boxesOverlap(bounds, other.collider))
        issues.push({
          code: 'OBJECT_COLLISION',
          entityId: object.id,
          message: `Object overlaps ${other.object.id}`,
        });
    for (const collider of compiled.colliders) {
      if (collider.role === 'furniture' || collider.role === 'slab' || collider.role === 'roof')
        continue;
      if (boxesOverlap(bounds, colliderBounds(collider)))
        issues.push({
          code: 'STRUCTURE_COLLISION',
          entityId: object.id,
          message: `Object overlaps ${collider.entityId}`,
        });
    }
    const floor = compiled.building.floors.find((value) => value.id === object.floorId);
    if (
      floor &&
      object.position.y < 1e-6 &&
      floor.voids.some((hole) => polygonsOverlap(boxPolygon(bounds), rectPolygon(hole.footprint)))
    )
      issues.push({
        code: 'UNSUPPORTED_OBJECT',
        entityId: object.id,
        message: 'Object has no floor support over a floor opening',
      });
    for (const stair of compiled.stairs)
      if (
        (object.floorId === stair.lower.floorId || object.floorId === stair.upper.floorId) &&
        bounds.position.y - bounds.size.y / 2 < stair.upper.position.y + profile.headroom &&
        polygonsOverlap(boxPolygon(bounds), rectPolygon(stair.footprint))
      )
        issues.push({
          code: 'STAIR_RESERVATION',
          entityId: object.id,
          message: `Object occupies stairwell ${stair.id}`,
        });
  }
  issues.push(...checkDoorClearance(compiled));
  for (const floor of compiled.building.floors)
    if (floor.height < profile.headroom)
      issues.push({
        code: 'LOW_CEILING',
        entityId: floor.id,
        message: 'Floor ceiling is too low for the walker',
      });
  issues.push(...checkStairClearance(compiled));
  return issues;
}
