import { blockingCollider } from '@refloor/engine/collision/probes';
import { contains, rotate } from '@refloor/engine/math';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine/types';

export function isPlayerPositionValid(
  compiled: CompiledBuilding,
  player: NavigationPoint,
): boolean {
  const floor = compiled.building.floors.find((value) => value.id === player.floorId);
  if (!floor || !Object.values(player.position).every(Number.isFinite)) return false;
  const point = player.position;
  if (
    Math.abs(point.y - floor.elevation) <= 0.06 &&
    contains(floor.footprint, point, compiled.options.radius) &&
    !floor.voids.some((hole) => contains(hole.footprint, point))
  ) {
    if (!blockingCollider(compiled, { ...point, y: floor.elevation }, 'current')) return true;
  }
  for (const stair of compiled.stairs) {
    if (player.floorId !== stair.lower.floorId && player.floorId !== stair.upper.floorId) continue;
    for (const surface of compiled.surfaces) {
      if (surface.entityId !== stair.id || Math.abs(surface.elevation - point.y) > 0.1) continue;
      const rect = surface.footprint,
        centre = { x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 };
      const local = rotate({ x: point.x - centre.x, z: point.z - centre.z }, -surface.rotation);
      if (Math.abs(local.x) > rect.width / 2 || Math.abs(local.z) > rect.depth / 2) continue;
      if (!blockingCollider(compiled, { ...point, y: surface.elevation }, 'current', stair))
        return true;
    }
  }
  return false;
}
