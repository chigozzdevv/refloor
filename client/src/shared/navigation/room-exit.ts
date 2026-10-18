import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { destinationRoute } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';

export function roomExit(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  stops: Destination[],
): Destination | null {
  const floor = compiled.building.floors.find((value) => value.id === player.floorId),
    room = floor?.rooms.find((value) => contains(value.footprint, player.position));
  if (!room || room.kind === 'corridor' || room.kind === 'stairwell') return null;
  const entry = entryPose(compiled);
  if (
    (floor?.id === entry.floorId && contains(room.footprint, entry.inside)) ||
    compiled.stairs.some((stair) =>
      [stair.lower, stair.upper].some(
        (landing) =>
          landing.floorId === player.floorId && contains(room.footprint, landing.position),
      ),
    )
  )
    return null;
  const exits = stops.flatMap((stop) => {
    if (stop.kind !== 'door' || stop.roomId !== room.id) return [];
    const route = destinationRoute(compiled, player, stop.target, 'openable');
    if (!route || route.stairIds.length) return [];
    const outside = floor?.rooms.find((value) => contains(value.footprint, stop.target.position));
    return [
      {
        stop,
        distance: route.length,
        priority: outside?.kind === 'corridor' || outside?.kind === 'stairwell' ? 0 : 1,
      },
    ];
  });
  return exits.sort((a, b) => a.priority - b.priority || a.distance - b.distance)[0]?.stop ?? null;
}
