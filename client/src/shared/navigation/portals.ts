import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { destinationRoute } from '@/shared/navigation/destinations';

export function tourPortals(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  stops: Destination[],
) {
  const floor = compiled.building.floors.find((value) => value.id === player.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, player.position));
  const links = stops.filter((stop) => {
    if (stop.floorId !== player.floorId || !stop.approach) return false;
    if (Math.abs(stop.approach.position.y - player.position.y) > 0.22) return false;
    if (room && stop.kind === 'door' && stop.roomId !== room.id) return false;
    if (room && stop.kind === 'stairs' && !contains(room.footprint, stop.approach.position))
      return false;
    const path = destinationRoute(compiled, player, stop.approach, 'current');
    return path !== null && path.stairIds.length === 0;
  });
  return links.sort((a, b) => a.id.localeCompare(b.id));
}

export type PortalCue = { destination: Destination; label: string };

export function navigationCues(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  links: Destination[],
): PortalCue[] {
  const room = compiled.building.floors
    .find((floor) => floor.id === player.floorId)
    ?.rooms.find((value) => contains(value.footprint, player.position));
  const exit =
    room &&
    room.kind !== 'corridor' &&
    room.kind !== 'stairwell' &&
    links.filter((link) => link.kind === 'door').length === 1;
  return links
    .toSorted((a, b) => Number(b.kind === 'stairs') - Number(a.kind === 'stairs'))
    .map((destination) => ({
      destination,
      label:
        exit && destination.kind === 'door'
          ? `Exit to ${destination.caption ?? destination.label}`
          : (destination.caption ?? destination.label),
    }));
}
