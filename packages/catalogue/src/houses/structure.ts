import type { Floor, Room, Wall } from '@refloor/scene';
import { finishes } from '@refloor/catalogue/materials';

export function createFloor(
  id: string,
  elevation: number,
  width: number,
  depth: number,
  upper: boolean,
): Floor {
  const split = width * 0.6,
    middle = depth / 2;
  const wall = (name: string, x: number, z: number, endX: number, endZ: number): Wall => ({
    id: `${id}/${name}`,
    start: { x, z },
    end: { x: endX, z: endZ },
    height: 2.8,
    thickness: 0.16,
    material: structuredClone(finishes.chalk),
    openings: [],
  });
  const south = wall('south', 0, 0, width, 0),
    north = wall('north', 0, depth, width, depth),
    west = wall('west', 0, 0, 0, depth),
    east = wall('east', width, 0, width, depth);
  const partition = wall('partition', split, 0, split, depth),
    divider = wall('divider', split, middle, width, middle);
  if (!upper)
    south.openings.push({
      id: `${id}/entrance`,
      kind: 'door',
      offset: split - 2,
      width: 1.1,
      height: 2.25,
      hinge: 'start',
      swing: 'inward',
      material: finishes.oak,
      state: { open: false },
    });
  for (const [index, offset] of [depth * 0.3, depth * 0.72].entries())
    partition.openings.push({
      id: `${id}/room-door-${index}`,
      kind: 'door',
      offset: offset - 0.5,
      width: 1,
      height: 2.2,
      hinge: 'start',
      swing: 'outward',
      material: finishes.oak,
      state: { open: false },
    });
  const window = (target: Wall, name: string, offset: number, size = 2.1) =>
    target.openings.push({
      id: `${id}/${name}`,
      kind: 'window',
      offset,
      width: size,
      height: 1.65,
      sill: 0.7,
      material: finishes.glass,
    });
  window(south, 'front-window', width * 0.73, 1.9);
  window(north, 'rear-window', 0.9, 1.8);
  window(north, 'bedroom-window', width * 0.74, 1.8);
  window(west, 'side-window', depth * 0.64, 2.5);
  window(east, 'east-window-1', 1.4, 2);
  window(east, 'east-window-2', middle + 1.3, 2);
  const room = (
    name: string,
    label: string,
    kind: Room['kind'],
    x: number,
    z: number,
    w: number,
    d: number,
    walls: Wall[],
  ): Room => ({
    id: `${id}/${name}`,
    name: label,
    kind,
    footprint: { x, z, width: w, depth: d },
    wallIds: walls.map((item) => item.id),
    floorMaterial: finishes.oak,
  });
  return {
    id,
    name: upper ? 'First floor' : 'Ground floor',
    elevation,
    height: 2.8,
    slabThickness: 0.2,
    footprint: { x: 0, z: 0, width, depth },
    rooms: [
      room('living', upper ? 'Gallery & lounge' : 'Living & dining', 'living', 0, 0, split, depth, [
        south,
        north,
        west,
        partition,
      ]),
      room(
        'front-room',
        upper ? 'Primary bedroom' : 'Guest bedroom',
        'bedroom',
        split,
        0,
        width - split,
        middle,
        [south, east, divider, partition],
      ),
      room(
        'rear-room',
        upper ? 'Studio' : 'Kitchen',
        upper ? 'workspace' : 'kitchen',
        split,
        middle,
        width - split,
        depth - middle,
        [north, east, divider, partition],
      ),
    ],
    walls: [south, north, west, east, partition, divider],
    voids: [],
  };
}
