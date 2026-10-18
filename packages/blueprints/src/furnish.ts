import type { Building, Floor, SceneObject } from '@refloor/scene';
import { createFurniture } from '@refloor/catalogue';

export function furnishFloor(
  floor: Floor,
  width: number,
  depth: number,
  upper: boolean,
): SceneObject[] {
  const split = width * 0.6,
    middle = depth / 2;
  const seatingX = Math.max(split * 0.59, 4.55);
  const place = (
    name: string,
    asset: string,
    room: string,
    x: number,
    z: number,
    rotation = 0,
    y = 0,
  ): SceneObject =>
    createFurniture(`catalogue/${asset}`, {
      id: `${floor.id}/${name}`,
      floorId: floor.id,
      roomId: `${floor.id}/${room}`,
      position: { x, y, z },
      rotation,
    });
  const objects = [
    place('sofa', 'sofa', 'living', seatingX, depth * 0.59),
    place('coffee-table', 'coffee-table', 'living', seatingX, depth * 0.76),
    place('lounge-chair', 'chair', 'living', split - 1.05, depth * 0.79, -Math.PI / 3),
    place('television', 'television', 'living', seatingX, depth - 0.16, Math.PI, 1.0),
    place('sideboard', 'cabinet', 'living', seatingX, depth - 0.37, Math.PI),
    place('olive-tree', 'plant', 'living', 0.7, depth - 0.75),
    place('pendant', 'pendant', 'living', split * 0.59, depth * 0.72, 0, 2.33),
    place('bed', 'bed', 'front-room', split + (width - split) * 0.58, middle - 1.25, Math.PI),
    place(
      'bedroom-light',
      'pendant',
      'front-room',
      split + (width - split) * 0.5,
      middle * 0.5,
      0,
      2.33,
    ),
    place('bedroom-plant', 'plant', 'front-room', width - 0.65, 0.9),
  ];
  if (!upper) {
    const kitchen = place(
      'kitchen-counter',
      'cabinet',
      'rear-room',
      width - 0.4,
      middle + (depth - middle) * 0.55,
      -Math.PI / 2,
    );
    kitchen.dimensions = { width: 2.8, height: 0.9, depth: 0.6 };
    objects.push(
      kitchen,
      place('kitchen-island', 'cabinet', 'rear-room', split + 2.1, middle + 2.45, Math.PI / 2),
      place('kitchen-light', 'pendant', 'rear-room', split + 2.1, middle + 2.45, 0, 2.33),
    );
  } else
    objects.push(
      place('studio-chair', 'chair', 'rear-room', split + 2, middle + 2.3, Math.PI),
      place('studio-sideboard', 'cabinet', 'rear-room', width - 0.4, depth - 1.3, -Math.PI / 2),
    );
  return objects;
}

export function furnishHouse(building: Building): void {
  for (const [index, floor] of building.floors.entries())
    building.objects.push(
      ...furnishFloor(floor, floor.footprint.width, floor.footprint.depth, index > 0),
    );
}
