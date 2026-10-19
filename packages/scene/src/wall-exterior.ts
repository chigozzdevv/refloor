import type { Floor, Wall } from '@refloor/scene/floor';

export function wallExteriorSide(floor: Floor, wall: Wall): 1 | -1 | null {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z,
    length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  const { x, z, width, depth } = floor.footprint,
    boundary = (axis: 'x' | 'z', value: number) =>
      Math.abs(wall.start[axis] - value) < 1e-6 && Math.abs(wall.end[axis] - value) < 1e-6;
  if (
    !boundary('x', x) &&
    !boundary('x', x + width) &&
    !boundary('z', z) &&
    !boundary('z', z + depth)
  )
    return null;
  const centre = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 },
    bounds = floor.footprint;
  const outside = (side: number) => {
    const x = centre.x - (dz / length) * side * wall.thickness,
      z = centre.z + (dx / length) * side * wall.thickness;
    return (
      x < bounds.x - 1e-6 ||
      x > bounds.x + bounds.width + 1e-6 ||
      z < bounds.z - 1e-6 ||
      z > bounds.z + bounds.depth + 1e-6
    );
  };
  return outside(1) && !outside(-1) ? 1 : outside(-1) && !outside(1) ? -1 : null;
}
