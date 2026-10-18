import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { buildNavigation, findPath } from '@refloor/engine';

export type StairTravel = {
  stairId: string;
  points: Point3[];
  index: number;
  idle: number;
  last: Point3;
};
export function stairTravel(
  compiled: CompiledBuilding,
  feet: Point3,
  forward: { x: number; z: number },
  previousStair: string | null = null,
): StairTravel | null {
  for (const stair of compiled.stairs) {
    for (const [start, end, path] of [
      [stair.lower, stair.upper, stair.path],
      [stair.upper, stair.lower, stair.path.toReversed()],
    ] as const) {
      if (
        Math.abs(feet.y - start.position.y) > 0.15 ||
        Math.hypot(feet.x - start.position.x, feet.z - start.position.z) > 2
      )
        continue;
      const next = path[1]!,
        dx = next.x - start.position.x,
        dz = next.z - start.position.z;
      if (
        previousStair === stair.id &&
        (forward.x * dx + forward.z * dz) / Math.hypot(dx, dz) < 0.5
      )
        continue;
      const route = findPath(
        buildNavigation(compiled, 'current'),
        { floorId: start.floorId, position: { ...feet, y: start.position.y } },
        end,
      );
      if (route) return { stairId: stair.id, points: route.points, index: 0, idle: 0, last: feet };
    }
    let nearest = -1,
      distance = 0.85;
    for (const [index, point] of stair.path.entries()) {
      const current = Math.hypot(point.x - feet.x, (point.y - feet.y) * 1.2, point.z - feet.z);
      if (current < distance) {
        nearest = index;
        distance = current;
      }
    }
    if (nearest < 0) continue;
    const before = stair.path[Math.max(0, nearest - 1)]!,
      after = stair.path[Math.min(stair.path.length - 1, nearest + 1)]!;
    const length = Math.hypot(after.x - before.x, after.z - before.z);
    const dot = (forward.x * (after.x - before.x) + forward.z * (after.z - before.z)) / length;
    if (Math.abs(dot) < 0.5) continue;
    const points = dot > 0 ? stair.path.slice(nearest) : stair.path.slice(0, nearest + 1).reverse();
    if (points.length < 2) continue;
    const first = points[0]!,
      next = points[1]!;
    if ((feet.x - first.x) * (next.x - first.x) + (feet.z - first.z) * (next.z - first.z) > 0.02)
      points.shift();
    return { stairId: stair.id, points, index: 0, idle: 0, last: feet };
  }
  return null;
}
