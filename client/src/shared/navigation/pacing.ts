import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { rotate } from '@refloor/engine/math';

export const navigationPace = {
  walk: 2.25,
  fastWalk: 3.2,
  guided: 2.8,
  doorway: 1.9,
  stairs: 1.7,
  acceleration: 4.2,
  braking: 4.4,
} as const;

export function journeyPace(compiled: CompiledBuilding, feet: Point3, next: Point3): number {
  const stairs =
    Math.abs(next.y - feet.y) > 0.08 ||
    compiled.stairs.some((stair) =>
      stair.path.some(
        (point) =>
          Math.abs(point.y - feet.y) < 0.4 && Math.hypot(point.x - feet.x, point.z - feet.z) < 0.7,
      ),
    );
  if (stairs) return navigationPace.stairs;
  const doorway = compiled.doors.some((door) => {
    if (Math.abs(feet.y - door.centre.y) > 0.4) return false;
    const local = rotate({ x: feet.x - door.centre.x, z: feet.z - door.centre.z }, -door.rotation);
    return Math.abs(local.x) < door.width / 2 + compiled.options.radius && Math.abs(local.z) < 0.85;
  });
  return doorway ? navigationPace.doorway : navigationPace.guided;
}
