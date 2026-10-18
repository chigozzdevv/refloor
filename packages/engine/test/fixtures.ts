import type { Building, Footprint } from '@refloor/scene';
import { rectPolygon, rotate } from '@refloor/engine/math';
import {
  createBuilding as sceneBuilding,
  createTwoStorey as sceneTwoStorey,
  first,
  getObject,
} from '@scene-test/fixtures';

export { edit, finish, first, getObject, createChair } from '@scene-test/fixtures';

export function createBuilding(): Building {
  const building = sceneBuilding();
  getObject(building, 'tv').position.z = 4.5;
  return building;
}

export function createTwoStorey(kind: 'u-shaped' | 'straight' = 'u-shaped'): Building {
  const building = sceneTwoStorey();
  const stair = first(building.stairs),
    lower = first(building.floors),
    upper = building.floors.find((floor) => floor.id === 'upper');
  if (!upper) throw new Error('Upper fixture floor is missing');
  getObject(building, 'tv').position.z = 4.5;
  getObject(building, 'sofa').position.x = 4;
  getObject(building, 'sofa').dimensions.width = 1.6;
  getObject(building, 'lamp').position.x = 4.2;
  stair.kind = kind;
  stair.heading = kind === 'u-shaped' ? Math.PI : 0;
  stair.footprint =
    kind === 'u-shaped'
      ? { x: 0.8, z: 0.5, width: 2.4, depth: 4 }
      : { x: 0.8, z: 2, width: 1.4, depth: 5.2 };
  first(upper.voids).footprint = structuredClone(stair.footprint);
  first(lower.walls).openings[0] = { ...first(first(lower.walls).openings), offset: 4.5 };
  first(upper.walls).openings = first(upper.walls).openings.filter(
    (opening) => opening.kind !== 'door',
  );
  if (kind === 'straight')
    for (const floor of [lower, upper]) {
      floor.footprint.depth = 10;
      for (const room of floor.rooms) room.footprint.depth = 10;
      for (const wall of floor.walls) {
        if (wall.start.z === 6) wall.start.z = 10;
        if (wall.end.z === 6) wall.end.z = 10;
      }
    }
  return building;
}

export function rotateBuilding(building: Building, angle: number): Building {
  const result = structuredClone(building);
  const footprint = (rect: Footprint): Footprint => {
    const points = rectPolygon(rect).map((p) => rotate(p, angle));
    const xs = points.map((p) => p.x),
      zs = points.map((p) => p.z);
    return {
      x: Math.min(...xs),
      z: Math.min(...zs),
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...zs) - Math.min(...zs),
    };
  };
  for (const floor of result.floors) {
    floor.footprint = footprint(floor.footprint);
    for (const room of floor.rooms) room.footprint = footprint(room.footprint);
    for (const hole of floor.voids) hole.footprint = footprint(hole.footprint);
    for (const wall of floor.walls) {
      wall.start = rotate(wall.start, angle);
      wall.end = rotate(wall.end, angle);
    }
  }
  for (const stair of result.stairs) {
    stair.footprint = footprint(stair.footprint);
    stair.heading += angle;
  }
  for (const object of result.objects) {
    object.position = { ...rotate(object.position, angle), y: object.position.y };
    object.rotation += angle;
  }
  return result;
}
