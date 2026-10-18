import { contains, distanceToBox } from '@refloor/engine/math';
import { standingBlocked } from '@refloor/engine/collision/probes';
import type { CompiledBuilding, NavigationPoint, Point3 } from '@refloor/engine/types';

export function isWalkable(
  compiled: CompiledBuilding,
  point: NavigationPoint,
  doorPolicy: 'openable' | 'current' = 'openable',
): boolean {
  const floor = compiled.building.floors.find((value) => value.id === point.floorId);
  const radius = compiled.options.radius + compiled.options.clearance;
  if (
    !floor ||
    Math.abs(point.position.y - floor.elevation) > 1e-6 ||
    floor.height < compiled.options.headroom ||
    !contains(floor.footprint, point.position, radius)
  )
    return false;
  const forbidden = [
    ...floor.voids.map((hole) => hole.footprint),
    ...compiled.stairs
      .filter((stair) => stair.lower.floorId === floor.id || stair.upper.floorId === floor.id)
      .map((stair) => stair.footprint),
  ];
  if (
    forbidden.some(
      (rect) =>
        distanceToBox(point.position, {
          id: '',
          entityId: '',
          floorId: floor.id,
          role: 'slab',
          shape: 'box',
          position: { x: rect.x + rect.width / 2, y: 0, z: rect.z + rect.depth / 2 },
          rotation: 0,
          size: { x: rect.width, y: 0, z: rect.depth },
        }) <
        radius - 1e-6,
    )
  )
    return false;
  return !standingBlocked(compiled, point.position, doorPolicy);
}

export function clearSegment(
  compiled: CompiledBuilding,
  floorId: string,
  a: Point3,
  b: Point3,
  policy: 'openable' | 'current',
): boolean {
  const count = Math.max(
    1,
    Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / (compiled.options.resolution / 2)),
  );
  for (let i = 0; i <= count; i++)
    if (
      !isWalkable(
        compiled,
        {
          floorId,
          position: {
            x: a.x + ((b.x - a.x) * i) / count,
            y: a.y,
            z: a.z + ((b.z - a.z) * i) / count,
          },
        },
        policy,
      )
    )
      return false;
  return true;
}
