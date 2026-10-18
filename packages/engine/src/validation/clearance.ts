import {
  boxPolygon,
  boxesOverlap,
  contains,
  polygonsOverlap,
  rectPolygon,
  rotate,
} from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import { blockingCollider, standingBlocked } from '@refloor/engine/collision/probes';
import type { CompiledBuilding, EngineIssue, Point2 } from '@refloor/engine/types';

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
  for (const floor of compiled.building.floors)
    if (floor.height < profile.headroom)
      issues.push({
        code: 'LOW_CEILING',
        entityId: floor.id,
        message: 'Floor ceiling is too low for the walker',
      });
  for (const stair of compiled.stairs) {
    let blocked: string | undefined;
    for (let i = 1; i < stair.path.length && !blocked; i++) {
      const a = stair.path[i - 1],
        b = stair.path[i];
      if (!a || !b) continue;
      const samples = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (profile.resolution / 2)),
      );
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        const point = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        };
        const obstacle = blockingCollider(compiled, point, 'openable', stair);
        if (obstacle) {
          blocked = obstacle.entityId;
          break;
        }
      }
    }
    if (blocked)
      issues.push({
        code: 'STAIR_HEADROOM',
        entityId: stair.id,
        message: `Stair route intersects ${blocked} or has insufficient headroom`,
      });
  }
  for (const stair of compiled.stairs)
    for (const landing of [stair.lower, stair.upper]) {
      const floor = compiled.building.floors.find((value) => value.id === landing.floorId);
      if (
        !floor ||
        !contains(floor.footprint, landing.position, profile.radius + profile.clearance) ||
        standingBlocked(compiled, landing.position)
      )
        issues.push({
          code: 'STAIR_ACCESS',
          entityId: stair.id,
          message: 'Stair landing is obstructed or too close to the floor boundary',
        });
    }
  return issues;
}
