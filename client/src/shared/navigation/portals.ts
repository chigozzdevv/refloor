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
      if (!approach || !room || !contains(room.footprint, approach.position)) return [];
      const distance = Math.hypot(
        approach.position.x - player.position.x,
        approach.position.z - player.position.z,
      );
      return distance < 3.5 && nearbyRoute(compiled, player, approach, 'current')
        ? [{ stop, distance }]
        : [];
    })
    .sort((a, b) => a.distance - b.distance)[0]?.stop;
  return [
    ...(exit ? [{ ...exit, label: 'Leave room', caption: 'Exit' }] : []),
    ...(stair ? [stair] : []),
  ];
}

export function portalPosition(
  x: number,
  y: number,
  behind: boolean,
  width: number,
  height: number,
) {
  const padding = 48;
  return {
    x: behind
      ? x < width / 2
        ? width - padding
        : padding
      : Math.max(padding, Math.min(width - padding, x)),
    y: Math.max(140, Math.min(height - 250, behind ? height * 0.5 : y)),
  };
}
