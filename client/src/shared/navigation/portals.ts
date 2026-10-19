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

export function portalPosition(
  player: NavigationPoint,
  destination: Destination,
  heading: number,
  width: number,
  height: number,
) {
  const bearing = Math.atan2(
    destination.anchor.x - player.position.x,
    player.position.z - destination.anchor.z,
  );
  const angle = Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading));
  return {
    x: angle < 0 ? 22 : width - 22,
    y: Math.max(110, Math.min(height - 210, height * 0.48)),
    angle: (angle * 180) / Math.PI,
  };
}
