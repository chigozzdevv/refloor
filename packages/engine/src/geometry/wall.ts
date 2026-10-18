import type { Floor, Wall } from '@refloor/scene';
import { contains, epsilon, uniqueSorted, worldPoint } from '@refloor/engine/math';
import { boxPart } from '@refloor/engine/geometry/part';
import { fail } from '@refloor/engine/errors';
import type { DoorPortal, MeshPart } from '@refloor/engine/types';

export function buildWall(
  floor: Floor,
  wall: Wall,
  maxParts: number,
): { parts: MeshPart[]; doors: DoorPortal[] } {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  if (length <= epsilon)
    fail('DEGENERATE_GEOMETRY', wall.id, 'Wall length must exceed numerical tolerance');
  const rotation = Math.atan2(-(wall.end.z - wall.start.z), wall.end.x - wall.start.x);
  const origin = { ...wall.start, y: floor.elevation };
  const cuts = wall.openings.map((opening) => ({
    x: opening.offset,
    z: opening.kind === 'window' ? opening.sill : 0,
    width: opening.width,
    depth: opening.height,
  }));
  const xs = uniqueSorted([0, length, ...cuts.flatMap((cut) => [cut.x, cut.x + cut.width])]);
  const ys = uniqueSorted([0, wall.height, ...cuts.flatMap((cut) => [cut.z, cut.z + cut.depth])]);
  if ((xs.length - 1) * (ys.length - 1) + wall.openings.length > maxParts)
    fail('GEOMETRY_LIMIT', wall.id, 'Wall subdivision exceeds the geometry budget');
  const parts: MeshPart[] = [],
    doors: DoorPortal[] = [];
  for (let xi = 0; xi < xs.length - 1; xi++)
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const x = xs[xi],
        nextX = xs[xi + 1],
        y = ys[yi],
        nextY = ys[yi + 1];
      if (x === undefined || nextX === undefined || y === undefined || nextY === undefined)
        continue;
      const centre = { x: (x + nextX) / 2, z: (y + nextY) / 2 };
      if (cuts.some((cut) => contains(cut, centre))) continue;
      parts.push(
        boxPart(
          {
            id: `${wall.id}:solid:${xi}:${yi}`,
            entityId: wall.id,
            floorId: floor.id,
            role: 'wall',
            rotation,
            position: worldPoint({ x: centre.x, y: centre.z, z: 0 }, origin, rotation),
          },
          { x: nextX - x, y: nextY - y, z: wall.thickness },
          wall.material,
        ),
      );
    }
  for (const opening of wall.openings) {
    if (opening.kind === 'window') {
      parts.push(
        boxPart(
          {
            id: `${opening.id}:pane`,
            entityId: opening.id,
            floorId: floor.id,
            role: 'window',
            rotation,
            position: worldPoint(
              { x: opening.offset + opening.width / 2, y: opening.sill + opening.height / 2, z: 0 },
              origin,
              rotation,
            ),
          },
          { x: opening.width, y: opening.height, z: Math.min(0.012, wall.thickness / 4) },
          opening.material,
        ),
      );
      continue;
    }
    const openingAngle =
      ((opening.hinge === 'start' ? -1 : 1) * (opening.swing === 'inward' ? 1 : -1) * Math.PI) / 2;
    const inset = Math.min(0.01, opening.width / 10),
      width = opening.width - 2 * inset;
    const hinge = worldPoint(
      {
        x: opening.offset + (opening.hinge === 'start' ? inset : opening.width - inset),
        y: 0,
        z: 0,
      },
      origin,
      rotation,
    );
    const angle = rotation + (opening.state.open ? openingAngle : 0);
    parts.push(
      boxPart(
        {
          id: `${opening.id}:leaf`,
          entityId: opening.id,
          floorId: floor.id,
          role: 'door',
          rotation: angle,
          position: worldPoint(
            { x: ((opening.hinge === 'start' ? 1 : -1) * width) / 2, y: opening.height / 2, z: 0 },
            hinge,
            angle,
          ),
        },
        {
          x: width,
          y: Math.max(opening.height - 0.02, opening.height / 2),
          z: Math.min(0.04, wall.thickness / 4),
        },
        opening.material,
      ),
    );
    doors.push({
      id: opening.id,
      wallId: wall.id,
      floorId: floor.id,
      hinge,
      centre: worldPoint({ x: opening.offset + opening.width / 2, y: 0, z: 0 }, origin, rotation),
      rotation,
      openingAngle,
      width: opening.width,
      height: opening.height,
      open: opening.state.open,
    });
  }
  return { parts, doors };
}
