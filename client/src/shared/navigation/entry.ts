import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { isWalkable } from '@refloor/engine';
import { clearSegment } from '@refloor/engine/navigation/surfaces';
import { contains, rotate } from '@refloor/engine/math';

const entries = new WeakMap<CompiledBuilding, ReturnType<typeof computeEntryPose>>();

export function entryPose(compiled: CompiledBuilding) {
  let entry = entries.get(compiled);
  if (!entry) {
    entry = computeEntryPose(compiled);
    entries.set(compiled, entry);
  }
  return entry;
}

function computeEntryPose(compiled: CompiledBuilding) {
  for (const floor of [...compiled.building.floors].sort((a, b) => a.elevation - b.elevation))
    for (const door of compiled.doors.filter((value) => value.floorId === floor.id)) {
      for (const sign of [-1, 1]) {
        const normal = rotate({ x: 0, z: sign }, door.rotation);
        const threshold: Point3 = {
          x: door.centre.x + normal.x * 0.6,
          y: floor.elevation,
          z: door.centre.z + normal.z * 0.6,
        };
        const opposite = { x: door.centre.x - normal.x * 0.6, z: door.centre.z - normal.z * 0.6 };
        if (!contains(floor.footprint, threshold) || contains(floor.footprint, opposite)) continue;
        const room = floor.rooms.find((value) => contains(value.footprint, threshold));
        const candidates = [0.65, 1, 1.4, 1.8, 2.2]
          .flatMap((distance) =>
            [0, -0.5, 0.5, -1, 1, -1.5, 1.5].map((side) => ({
              x: door.centre.x + normal.x * distance + normal.z * side,
              y: floor.elevation,
              z: door.centre.z + normal.z * distance - normal.x * side,
            })),
          )
          .filter(
            (point) =>
              (!room || contains(room.footprint, point, 0.1)) &&
              Math.hypot(point.x - door.hinge.x, point.z - door.hinge.z) >
                door.width + compiled.options.radius + 0.1 &&
              isWalkable(compiled, { floorId: floor.id, position: point }, 'openable') &&
              clearSegment(compiled, floor.id, threshold, point, 'openable'),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - threshold.x, a.z - threshold.z) -
              Math.hypot(b.x - threshold.x, b.z - threshold.z),
          );
        const inside = candidates[0] ?? threshold;
        return {
          doorId: door.id,
          floorId: floor.id,
          inside,
          threshold,
          normal,
          outside: {
            x: door.centre.x - normal.x * 3.5 + normal.z * 0.6,
            y: floor.elevation + 1.6,
            z: door.centre.z - normal.z * 3.5 - normal.x * 0.6,
          },
          target: {
            x: door.centre.x + normal.z,
            y: floor.elevation + 1.2,
            z: door.centre.z - normal.x,
          },
        };
      }
    }
  throw new Error('This building has no accessible exterior entrance');
}
