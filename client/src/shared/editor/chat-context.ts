import type { Building } from '@refloor/scene';
import type { Selection } from '@/shared/editor/editor-store';
import { targetIdentity } from '@/shared/editor/identity';

export function selectedContext(building: Building, selection: Selection) {
  if (!selection) return null;
  const identity = targetIdentity(building, selection, selection.point);
  if (!identity) return null;
  if (selection.kind === 'roof') {
    const top = [...building.floors].sort((a, b) => b.elevation - a.elevation)[0]!;
    return {
      ...identity,
      position: selection.point ?? {
        x: top.footprint.x + top.footprint.width / 2,
        y: top.elevation + top.height,
        z: top.footprint.z + top.footprint.depth / 2,
      },
      suggestions: ['Asphalt roofing', 'Change the colour'],
      object: null,
    };
  }
  for (const floor of building.floors) {
    if (selection.kind === 'object') {
      const object = building.objects.find(
        (item) => item.id === selection.id && item.floorId === floor.id,
      );
      if (object) {
        const tv = object.behaviours.find((value) => value.kind === 'television'),
          light = object.behaviours.find((value) => value.kind === 'light');
        return {
          ...identity,
          position: {
            x: object.position.x,
            y: floor.elevation + object.position.y + object.dimensions.height / 2,
            z: object.position.z,
          },
          suggestions: tv
            ? [tv.state.powered ? 'Turn off' : 'Turn on', 'Move left 20 cm']
            : light
              ? [light.state.powered ? 'Turn off' : 'Turn on', 'Make it brighter']
              : ['Move left 20 cm', 'Change the colour'],
          object,
        };
      }
    }
    if (selection.kind === 'wall') {
      const wall = floor.walls.find((item) => item.id === selection.id);
      if (wall)
        return {
          ...identity,
          position: selection.point ?? {
            x: (wall.start.x + wall.end.x) / 2,
            y: floor.elevation + 1.5,
            z: (wall.start.z + wall.end.z) / 2,
          },
          suggestions:
            selection.side === 'exterior'
              ? ['Brick finish', 'Marble finish']
              : ['Paint it cream', 'Paint it sage'],
          object: null,
        };
    }
    if (selection.kind === 'floor') {
      const room = floor.rooms.find((item) => item.id === selection.id);
      if (room)
        return {
          ...identity,
          position: selection.point ?? {
            x: room.footprint.x + room.footprint.width / 2,
            y: floor.elevation,
            z: room.footprint.z + room.footprint.depth / 2,
          },
          suggestions: ['Oak finish', 'Walnut finish'],
          object: null,
        };
    }
    if (selection.kind === 'door') {
      const door = floor.walls
        .flatMap((wall) => wall.openings)
        .find((item) => item.kind === 'door' && item.id === selection.id);
      if (door?.kind === 'door')
        return {
          ...identity,
          position: selection.point ?? { x: 0, y: floor.elevation + 1, z: 0 },
          suggestions: [door.state.open ? 'Close the door' : 'Open the door'],
          object: null,
        };
    }
  }
  return null;
}
