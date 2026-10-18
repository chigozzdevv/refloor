import type { Floor, Wall } from '@refloor/scene';
import { worldPoint } from '@refloor/engine/math';
import { boxPart } from '@refloor/engine/geometry/part';
import type { DoorPortal, MeshPart } from '@refloor/engine/types';

export function buildOpenings(
  floor: Floor,
  wall: Wall,
  rotation: number,
): { parts: MeshPart[]; doors: DoorPortal[] } {
  const origin = { ...wall.start, y: floor.elevation };
  const parts: MeshPart[] = [],
    doors: DoorPortal[] = [];
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
