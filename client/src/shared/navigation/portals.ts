import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import type { Destination } from '@/shared/navigation/destinations';
import { destinationRoute } from '@/shared/navigation/destinations';
import { roomExit } from '@/shared/navigation/room-exit';

export function tourPortals(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  stops: Destination[],
) {
  const exit = roomExit(compiled, player, stops);
  const stair = stops
    .filter((stop) => stop.kind === 'stairs' && stop.floorId === player.floorId)
    .flatMap((stop) => {
      const route = destinationRoute(compiled, player, stop.target, 'openable');
      return route ? [{ stop, distance: route.length }] : [];
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
