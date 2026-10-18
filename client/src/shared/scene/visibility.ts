import type { Floor, Wall } from '@refloor/scene';
import type { Point3 } from '@refloor/engine';

export function hiddenExterior(wall: Wall, floor: Floor, camera: Point3): boolean {
  const f = floor.footprint,
    horizontal = Math.abs(wall.start.z - wall.end.z) < 0.001;
  if (horizontal && Math.abs(wall.start.z - f.z) < 0.001) return camera.z < f.z + f.depth / 2;
  if (horizontal && Math.abs(wall.start.z - f.z - f.depth) < 0.001)
    return camera.z > f.z + f.depth / 2;
  if (!horizontal && Math.abs(wall.start.x - f.x) < 0.001) return camera.x < f.x + f.width / 2;
  if (!horizontal && Math.abs(wall.start.x - f.x - f.width) < 0.001)
    return camera.x > f.x + f.width / 2;
  return false;
}
