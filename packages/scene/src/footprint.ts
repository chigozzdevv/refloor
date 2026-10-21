import type { Floor } from '@refloor/scene/floor';
import type { Footprint } from '@refloor/scene/primitives';
type Point = { x: number; z: number };

const epsilon = 1e-6;
export function insideRectangle(rect: Footprint, point: Point) {
  return (
    point.x > rect.x + epsilon &&
    point.x < rect.x + rect.width - epsilon &&
    point.z > rect.z + epsilon &&
    point.z < rect.z + rect.depth - epsilon
  );
}

export function subtractRectangles(bounds: Footprint, cuts: Footprint[]): Footprint[] {
  const coordinates = (axis: 'x' | 'z', size: 'width' | 'depth') =>
    [
      ...new Set([
        bounds[axis],
        bounds[axis] + bounds[size],
        ...cuts.flatMap((cut) => [
          Math.max(bounds[axis], cut[axis]),
          Math.min(bounds[axis] + bounds[size], cut[axis] + cut[size]),
        ]),
      ]),
    ].sort((a, b) => a - b);
  const xs = coordinates('x', 'width'),
    zs = coordinates('z', 'depth');
  return xs.slice(1).flatMap((right, xi) =>
    zs.slice(1).flatMap((rear, zi) => {
      const x = xs[xi]!,
        z = zs[zi]!,
        width = right - x,
        depth = rear - z;
      if (
        width < epsilon ||
        depth < epsilon ||
        cuts.some((cut) => insideRectangle(cut, { x: x + width / 2, z: z + depth / 2 }))
      )
        return [];
      return [{ x, z, width, depth }];
    }),
  );
}

export function floorCourtyards(floor: Floor) {
  return floor.voids.filter((hole) => hole.kind === 'courtyard').map((hole) => hole.footprint);
}

export function floorBoundary(floor: Floor) {
  const cuts = floorCourtyards(floor),
    regions = subtractRectangles(floor.footprint, cuts),
    inside = (point: Point) =>
      insideRectangle(floor.footprint, point) && !cuts.some((cut) => insideRectangle(cut, point));
  return regions.flatMap(({ x, z, width, depth }) =>
    [
      { start: { x, z }, end: { x: x + width, z }, normal: { x: 0, z: -1 } },
      { start: { x, z: z + depth }, end: { x: x + width, z: z + depth }, normal: { x: 0, z: 1 } },
      { start: { x, z }, end: { x, z: z + depth }, normal: { x: -1, z: 0 } },
      { start: { x: x + width, z }, end: { x: x + width, z: z + depth }, normal: { x: 1, z: 0 } },
    ].filter(
      ({ start, end, normal }) =>
        !inside({
          x: (start.x + end.x) / 2 + normal.x * 0.001,
          z: (start.z + end.z) / 2 + normal.z * 0.001,
        }),
    ),
  );
}
