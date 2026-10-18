import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { nearbyRoute } from '@/shared/navigation/destinations';
import { roomExit } from '@/shared/navigation/room-exit';

export function tourPortals(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  stops: Destination[],
) {
  const exit = roomExit(compiled, player, stops);
  const floor = compiled.building.floors.find((value) => value.id === player.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, player.position));
  const stair = stops
    .filter((stop) => stop.kind === 'stairs' && stop.floorId === player.floorId)
    .flatMap((stop) => {
      const approach = stop.approach;
      if (
        !approach ||
        !room ||
        !contains(room.footprint, approach.position) ||
        Math.abs(approach.position.y - player.position.y) > 0.22
      )
        return [];
      const distance = Math.hypot(
        approach.position.x - player.position.x,
        approach.position.z - player.position.z,
      );
      return distance < 3.5 && nearbyRoute(compiled, player, approach, 'current')
        ? [{ stop, distance }]
        : [];
    })
    .sort((a, b) => a.distance - b.distance)[0]?.stop;
  return [...(exit ? [{ ...exit, label: 'Leave room' }] : []), ...(stair ? [stair] : [])];
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
