import { rotate } from '@refloor/engine/math';
import type { CompiledBuilding, DoorPortal, Point3 } from '@refloor/engine/types';

export function doorCrossings(compiled: CompiledBuilding, points: Point3[]) {
  const result: { door: DoorPortal; index: number; side: number }[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    for (const door of compiled.doors) {
      if (seen.has(door.id)) continue;
      const p = rotate({ x: a.x - door.centre.x, z: a.z - door.centre.z }, -door.rotation),
        q = rotate({ x: b.x - door.centre.x, z: b.z - door.centre.z }, -door.rotation);
      const start = Math.abs(p.z) < 1e-6 ? 0 : p.z,
        end = Math.abs(q.z) < 1e-6 ? 0 : q.z;
      if (start * end > 0 || Math.abs(start - end) < 1e-6) continue;
      const t = start / (start - end),
        x = p.x + (q.x - p.x) * t,
        y = a.y + (b.y - a.y) * t;
      if (
        Math.abs(x) >= door.width / 2 ||
        y < door.centre.y - 0.05 ||
        y >= door.centre.y + door.height
      )
        continue;
      seen.add(door.id);
      result.push({ door, index, side: Math.sign(start || -end) });
    }
  }
  return result;
}
