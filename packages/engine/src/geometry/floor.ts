import type { Floor } from '@refloor/scene';
import { fail } from '@refloor/engine/errors';
import { contains, epsilon, uniqueSorted } from '@refloor/engine/math';
import { boxPart } from '@refloor/engine/geometry/part';
import type { MeshPart, WalkSurface } from '@refloor/engine/types';

export function buildFloor(
  floor: Floor,
  maxParts: number,
): { parts: MeshPart[]; surfaces: WalkSurface[] } {
  const rectangles = [
    floor.footprint,
    ...floor.rooms.map((room) => room.footprint),
    ...floor.voids.map((hole) => hole.footprint),
  ];
  if (rectangles.some((rect) => rect.width <= epsilon || rect.depth <= epsilon))
    fail('DEGENERATE_GEOMETRY', floor.id, 'Floor regions must exceed numerical tolerance');
  const xs = uniqueSorted(rectangles.flatMap((rect) => [rect.x, rect.x + rect.width]));
  const zs = uniqueSorted(rectangles.flatMap((rect) => [rect.z, rect.z + rect.depth]));
  if ((xs.length - 1) * (zs.length - 1) > maxParts)
    fail('GEOMETRY_LIMIT', floor.id, 'Floor subdivision exceeds the geometry budget');
  const parts: MeshPart[] = [],
    surfaces: WalkSurface[] = [];
  for (let xi = 0; xi < xs.length - 1; xi++)
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const x = xs[xi],
        nx = xs[xi + 1],
        z = zs[zi],
        nz = zs[zi + 1];
      if (x === undefined || nx === undefined || z === undefined || nz === undefined) continue;
      const centre = { x: (x + nx) / 2, z: (z + nz) / 2 };
      if (floor.voids.some((hole) => contains(hole.footprint, centre))) continue;
      const room = floor.rooms.find((value) => contains(value.footprint, centre));
      if (!room) fail('UNASSIGNED_FLOOR', floor.id, 'Every floor region needs a room and finish');
      const id = `${floor.id}:slab:${xi}:${zi}`;
      parts.push(
        boxPart(
          {
            id,
            entityId: floor.id,
            floorId: floor.id,
            role: 'slab',
            rotation: 0,
            position: { ...centre, y: floor.elevation - floor.slabThickness / 2 },
          },
          { x: nx - x, y: floor.slabThickness, z: nz - z },
          room.floorMaterial,
        ),
      );
      surfaces.push({
        id: `${id}:surface`,
        entityId: room.id,
        floorId: floor.id,
        footprint: { x, z, width: nx - x, depth: nz - z },
        elevation: floor.elevation,
        rotation: 0,
      });
    }
  return { parts, surfaces };
}
