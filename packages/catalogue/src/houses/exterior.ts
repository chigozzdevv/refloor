import type { Building, SceneObject } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';
import { assetFromCatalogue } from '@refloor/catalogue/furniture';

export function exteriorAdditions(building: Building): SceneObject[] {
  const compiled = compileBuilding(building);
  const ground = building.floors.reduce((a, b) => (a.elevation < b.elevation ? a : b));
  const additions: SceneObject[] = [];
  const add = (object: SceneObject) => {
    if (!building.objects.some((value) => value.id === object.id)) additions.push(object);
  };
  for (const door of compiled.doors.filter((value) => value.floorId === ground.id))
    for (const sign of [-1, 1]) {
      const outward = rotate({ x: 0, z: sign }, door.rotation);
      const inside = { x: door.centre.x - outward.x * 0.5, z: door.centre.z - outward.z * 0.5 };
      if (
        contains(ground.footprint, {
          x: door.centre.x + outward.x * 0.5,
          z: door.centre.z + outward.z * 0.5,
        }) ||
        !contains(ground.footprint, inside)
      )
        continue;
      const room = ground.rooms.find((value) => contains(value.footprint, inside));
      const wall = ground.walls.find((value) => value.id === door.wallId);
      if (!room || !wall) continue;
      const rotation = Math.atan2(outward.x, outward.z);
      const position = (side: number, distance: number, y: number) => ({
        x: door.centre.x + outward.z * side + outward.x * distance,
        y,
        z: door.centre.z - outward.x * side + outward.z * distance,
      });
      const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      const solidWall = (
        point: { x: number; z: number },
        width: number,
        y: number,
        height: number,
      ) => {
        const offset =
          ((point.x - wall.start.x) * (wall.end.x - wall.start.x) +
            (point.z - wall.start.z) * (wall.end.z - wall.start.z)) /
          wallLength;
        return (
          y >= 0.12 &&
          y + height <= wall.height - 0.12 &&
          offset - width / 2 > 0.12 &&
          offset + width / 2 < wallLength - 0.12 &&
          !wall.openings.some((opening) => {
            const sill = opening.kind === 'window' ? opening.sill : 0;
            return (
              y < sill + opening.height + 0.08 &&
              y + height > sill - 0.08 &&
              offset + width / 2 > opening.offset - 0.12 &&
              offset - width / 2 < opening.offset + opening.width + 0.12
            );
          })
        );
      };
      for (const side of [-1, 1]) {
        const label = side < 0 ? 'Left' : 'Right';
        const suffix = side < 0 ? 'left' : 'right';
        const floodlight = assetFromCatalogue('catalogue/floodlight');
        const floodHeight = Math.min(2.4, wall.height - floodlight.dimensions.height - 0.15);
        const floodSide = Array.from({ length: 16 }, (_, i) => side * (1.8 - i * 0.1)).find(
          (offset) =>
            solidWall(
              position(offset, 0, floodHeight),
              floodlight.dimensions.width,
              floodHeight,
              floodlight.dimensions.height,
            ),
        );
        if (floodSide !== undefined)
          add({
            ...floodlight,
            id: `site/floodlight-${suffix}`,
            label: `${label} entrance floodlight`,
            floorId: ground.id,
            roomId: room.id,
            placement: 'exterior',
            position: position(
              floodSide,
              wall.thickness / 2 + floodlight.dimensions.depth / 2 + 0.012,
              floodHeight,
            ),
            rotation,
          });
        const sconce = assetFromCatalogue('catalogue/wall-light');
        const height = Math.min(1.65, ground.height - sconce.dimensions.height - 0.15);
        const lightSide = Array.from(
          { length: 12 },
          (_, i) => side * (door.width / 2 + 0.45 + i * 0.2),
        ).find((offset) =>
          solidWall(
            position(offset, 0, height),
            sconce.dimensions.width,
            height,
            sconce.dimensions.height,
          ),
        );
        if (lightSide !== undefined)
          add({
            ...sconce,
            id: `site/wall-light-${suffix}`,
            label: `${label} entrance wall light`,
            floorId: ground.id,
            roomId: room.id,
            placement: 'exterior',
            position: position(
              lightSide,
              wall.thickness / 2 + sconce.dimensions.depth / 2 + 0.012,
              height,
            ),
            rotation,
          });
        add({
          ...assetFromCatalogue('catalogue/outdoor-planter'),
          id: `site/planter-${suffix}`,
          label: `${label} entrance planter`,
          floorId: ground.id,
          roomId: room.id,
          placement: 'exterior',
          position: position(side * (door.width / 2 + 1.3), 0.9, -0.095),
          rotation,
        });
      }
      return additions;
    }
  return additions;
}

export function furnishExterior(building: Building) {
  building.objects.push(...exteriorAdditions(building));
}
