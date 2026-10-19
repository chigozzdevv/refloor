import type { Building, Floor, Position } from '@refloor/scene';
import type { ChatTarget } from '@refloor/scene/chat';

function nearbyRooms(floor: Floor, point: Pick<Position, 'x' | 'z'>) {
  return floor.rooms
    .filter(
      ({ footprint: rect }) =>
        Math.hypot(
          Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width),
          Math.max(rect.z - point.z, 0, point.z - rect.z - rect.depth),
        ) < 0.3,
    )
    .map((room) => room.name)
    .join(' / ');
}

export function targetIdentity(building: Building, target: ChatTarget, point?: Position) {
  if (target.kind === 'house') return { label: 'House', location: building.name };
  if (target.kind === 'roof' && building.roof.id === target.id)
    return { label: 'Roof', location: 'Exterior' };
  if (target.kind === 'object') {
    const object = building.objects.find((item) => item.id === target.id);
    if (!object) return null;
    const floor = building.floors.find((item) => item.id === object.floorId),
      room = floor?.rooms.find((item) => item.id === object.roomId),
      siblings = building.objects
        .filter(
          (item) =>
            item.floorId === object.floorId &&
            item.roomId === object.roomId &&
            item.label === object.label,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      label =
        siblings.length > 1
          ? `${object.label} ${siblings.findIndex((item) => item.id === object.id) + 1}`
          : object.label;
    return {
      label,
      location:
        object.placement === 'exterior'
          ? 'Compound'
          : [room?.name, floor?.name].filter(Boolean).join(' · '),
    };
  }
  for (const floor of building.floors) {
    if (target.kind === 'floor') {
      const room = floor.rooms.find((item) => item.id === target.id);
      if (room) return { label: `${room.name} floor`, location: floor.name };
    }
    for (const wall of floor.walls) {
      if (target.kind === 'wall' && wall.id === target.id) {
        if (target.side === 'exterior') return { label: 'Exterior wall', location: floor.name };
        const rooms = nearbyRooms(
          floor,
          point ?? { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 },
        );
        return { label: rooms ? `${rooms} wall` : 'Wall', location: floor.name };
      }
      const door =
        target.kind === 'door'
          ? wall.openings.find((item) => item.kind === 'door' && item.id === target.id)
          : null;
      if (door) {
        const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
          distance = (door.offset + door.width / 2) / length,
          rooms = nearbyRooms(floor, {
            x: wall.start.x + (wall.end.x - wall.start.x) * distance,
            z: wall.start.z + (wall.end.z - wall.start.z) * distance,
          });
        return { label: rooms ? `${rooms} door` : 'Door', location: floor.name };
      }
    }
  }
  return null;
}
