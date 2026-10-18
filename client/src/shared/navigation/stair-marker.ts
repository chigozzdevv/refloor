import type { Point3 } from '@refloor/engine';

export function stairMarker(path: readonly Point3[], distance = 1.1) {
  let travelled = 0;
  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1]!,
      point = path[index]!;
    travelled += Math.hypot(point.x - previous.x, point.z - previous.z);
    if (travelled < distance && index < path.length - 1) continue;
    const ahead = path[index + 1] ?? point;
    return {
      anchor: { ...point, y: point.y + 0.055 },
      bearing: Math.atan2(previous.x - ahead.x, previous.z - ahead.z),
    };
  }
  return { anchor: { ...path[0]!, y: path[0]!.y + 0.055 }, bearing: 0 };
}
