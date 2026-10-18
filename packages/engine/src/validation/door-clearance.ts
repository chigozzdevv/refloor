import { boxPolygon, boxesOverlap, polygonsOverlap, rotate } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import type { CompiledBuilding, EngineIssue, Point2 } from '@refloor/engine/types';

export function checkDoorClearance(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [],
    profile = compiled.options;
  for (const door of compiled.doors) {
    if (door.width < profile.radius * 2 + profile.clearance * 2 || door.height < profile.headroom)
      issues.push({
        code: 'DOOR_CLEARANCE',
        entityId: door.id,
        message: 'Door opening is too small for the walker',
      });
    const direction =
      rotate({ x: door.centre.x - door.hinge.x, z: door.centre.z - door.hinge.z }, -door.rotation)
        .x > 0
        ? 1
        : -1;
    const sweep: Point2[] = [{ x: door.hinge.x, z: door.hinge.z }];
    const radius = (door.width + profile.clearance) / Math.cos(Math.PI / 72);
    for (let i = 0; i <= 18; i++) {
      const tip = rotate(
        { x: direction * radius, z: 0 },
        door.rotation + (door.openingAngle * i) / 18,
      );
      sweep.push({ x: door.hinge.x + tip.x, z: door.hinge.z + tip.z });
    }
    for (const collider of compiled.colliders) {
      if (
        collider.entityId === door.id ||
        collider.entityId === door.wallId ||
        !['wall', 'window', 'furniture', 'stair-tread', 'stair-landing', 'stair-railing'].includes(
          collider.role,
        )
      )
        continue;
      const box = colliderBounds(collider);
      if (
        box.position.y - box.size.y / 2 >= door.hinge.y + door.height ||
        box.position.y + box.size.y / 2 <= door.hinge.y
      )
        continue;
      if (polygonsOverlap(sweep, boxPolygon(box)))
        issues.push({
          code: 'DOOR_SWING',
          entityId: door.id,
          message: `Door swing is obstructed by ${box.entityId}`,
        });
    }
  }
  const leaves = compiled.colliders.filter((collider) => collider.role === 'door');
  for (const [index, leaf] of leaves.entries()) {
    for (const other of leaves.slice(0, index)) {
      if (boxesOverlap(colliderBounds(leaf), colliderBounds(other)))
        issues.push({
          code: 'DOOR_COLLISION',
          entityId: leaf.entityId,
          message: `Door leaf overlaps ${other.entityId}`,
        });
    }
  }
  return issues;
}
