import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { destinations, destinationRoute } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';

const hubs = new WeakMap<CompiledBuilding, Set<string>>();

function circulationRooms(compiled: CompiledBuilding) {
  let rooms = hubs.get(compiled);
  if (rooms) return rooms;
  rooms = new Set<string>();
  const entry = entryPose(compiled),
    landings = compiled.stairs.flatMap((stair) => [stair.lower, stair.upper]);
  for (const floor of compiled.building.floors)
    for (const room of floor.rooms)
      if (
        room.kind === 'corridor' ||
        room.kind === 'stairwell' ||
        (entry.floorId === floor.id && contains(room.footprint, entry.inside)) ||
        landings.some(
          (landing) => landing.floorId === floor.id && contains(room.footprint, landing.position),
        )
      )
        rooms.add(room.id);
  hubs.set(compiled, rooms);
  return rooms;
}

export function tourPortals(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  stops: Destination[],
) {
  const floor = compiled.building.floors.find((value) => value.id === player.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, player.position));
  const links = stops.flatMap((stop): Destination[] => {
    if (stop.floorId !== player.floorId || !stop.approach) return [];
    if (Math.abs(stop.approach.position.y - player.position.y) > 0.22) return [];
    if (room && stop.kind === 'door' && stop.roomId !== room.id) return [];
    if (room && stop.kind === 'stairs' && !contains(room.footprint, stop.approach.position))
      return [];
    const path = destinationRoute(compiled, player, stop.approach, 'current');
    if (!path || path.stairIds.length) return [];
    if (stop.kind === 'stairs' && path.length > 2)
      return [
        {
          ...stop,
          kind: 'waypoint',
          label: 'Walk to stairs',
          caption: 'Stairs',
          anchor: { ...stop.approach.position, y: stop.approach.position.y + 0.055 },
          target: stop.approach,
          ...(room ? { roomId: room.id } : {}),
          lookAt: { ...stop.anchor, y: stop.anchor.y + 1.1 },
        },
      ];
    return [stop];
  });
  const entry = entryPose(compiled);
  if (
    room &&
    entry.floorId === player.floorId &&
    contains(room.footprint, entry.inside) &&
    Math.hypot(player.position.x - entry.inside.x, player.position.z - entry.inside.z) > 0.8
  ) {
    const target = { floorId: entry.floorId, position: entry.inside },
      route = destinationRoute(compiled, player, target, 'current');
    if (route && !route.stairIds.length)
      links.push({
        id: `entrance:${entry.doorId}`,
        kind: 'waypoint',
        label: 'Walk to entrance',
        caption: 'Entrance',
        floorId: entry.floorId,
        roomId: room.id,
        anchor: { ...entry.inside, y: entry.inside.y + 0.055 },
        target,
        lookAt: entry.target,
      });
  }
  return links.sort((a, b) => a.id.localeCompare(b.id));
}

export type PortalCue = { destination: Destination; label: string };

export function navigationCues(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  links: Destination[],
): PortalCue[] {
  const floor = compiled.building.floors.find((value) => value.id === player.floorId),
    room = floor?.rooms.find((value) => contains(value.footprint, player.position)),
    waypoints = links
      .filter((link) => link.kind === 'waypoint')
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .filter(
        (link, index, values) =>
          !values.slice(0, index).some((previous) => previous.id === link.id),
      )
      .map((destination) => ({ destination, label: destination.label })),
    stairs = links
      .filter(
        (link, index) =>
          link.kind === 'stairs' &&
          !links
            .slice(0, index)
            .some(
              (previous) =>
                previous.kind === 'stairs' &&
                previous.stairId === link.stairId &&
                previous.direction === link.direction,
            ),
      )
      .map((destination) => ({
        destination,
        label: destination.caption ?? destination.label,
      }));
  const circulation = circulationRooms(compiled),
    doorLinks = links
      .filter((link) => link.kind === 'door' && (!room || link.roomId === room.id))
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .filter(
        (link, index, values) =>
          !values.slice(0, index).some((previous) => previous.doorId === link.doorId),
      );
  if (!room || circulation.has(room.id))
    return [
      ...doorLinks.map((destination) => ({
        destination,
        label: destination.caption ?? destination.label,
      })),
      ...stairs,
      ...waypoints,
    ];
  const doors = destinations(compiled).filter((destination) => destination.kind === 'door'),
    exits = doorLinks
      .map((destination) => {
        const target = floor?.rooms.find((value) =>
          contains(value.footprint, destination.target.position),
        );
        return {
          destination,
          hub: target ? circulation.has(target.id) : false,
          connections: new Set(
            doors.filter((door) => door.roomId === target?.id).map((door) => door.doorId),
          ).size,
        };
      })
      .sort(
        (a, b) =>
          Number(b.hub) - Number(a.hub) ||
          b.connections - a.connections ||
          a.destination.id.localeCompare(b.destination.id),
      );
  return [
    ...stairs,
    ...waypoints,
    ...exits.map(({ destination }, index) => ({
      destination,
      label:
        index === 0
          ? `Exit to ${destination.caption ?? destination.label}`
          : (destination.caption ?? destination.label),
    })),
  ];
}
