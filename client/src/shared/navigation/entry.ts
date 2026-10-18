import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';

export function entryPose(compiled: CompiledBuilding) {
  for (const floor of [...compiled.building.floors].sort((a, b) => a.elevation - b.elevation))
    for (const door of compiled.doors.filter((value) => value.floorId === floor.id)) {
      for (const sign of [-1, 1]) {
        const normal = rotate({ x: 0, z: sign }, door.rotation);
        const inside: Point3 = {
          x: door.centre.x + normal.x * 0.6,
          y: floor.elevation,
          z: door.centre.z + normal.z * 0.6,
        };
        const opposite = { x: door.centre.x - normal.x * 0.6, z: door.centre.z - normal.z * 0.6 };
        if (!contains(floor.footprint, inside) || contains(floor.footprint, opposite)) continue;
        return {
          doorId: door.id,
          floorId: floor.id,
          inside,
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
