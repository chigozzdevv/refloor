import type { CompiledBuilding, NavigationPoint, Point3 } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { destinations, nearbyRoute } from '@/shared/navigation/destinations';
import { clearView } from '@/shared/navigation/viewpoints';

export type ArrivalView = {
  point: Point3;
  entityId: string;
  kind: 'door' | 'stairs' | 'object' | 'waypoint';
};

export function arrivalView(
  compiled: CompiledBuilding,
  target: NavigationPoint,
  preferred?: Point3,
): ArrivalView | null {
  const floor = compiled.building.floors.find((value) => value.id === target.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, target.position));
  if (!floor || !room) return null;
  const from = { ...target.position, y: target.position.y + 1.62 };
  const transit = room.kind === 'corridor' || room.kind === 'stairwell';
  const candidates: (ArrivalView & { score: number })[] = [];
  const add = (view: ArrivalView, priority: number, ignoreId?: string) => {
    const distance = Math.hypot(view.point.x - from.x, view.point.z - from.z);
    if (
      distance < (view.kind === 'stairs' ? 0.2 : 0.65) ||
      distance > 10 ||
      !clearView(compiled, from, view.point, ignoreId)
    )
      return;
    const preferredDistance = preferred
      ? Math.hypot(
          preferred.x - view.point.x,
          preferred.y - view.point.y,
          preferred.z - view.point.z,
        )
      : Infinity;
    candidates.push({
      ...view,
      score: priority + distance * 0.12 - (preferredDistance < 0.75 ? 1.5 : 0),
    });
  };
  for (const stop of destinations(compiled)) {
    if (stop.floorId !== floor.id) continue;
    if (stop.kind === 'door' && stop.roomId === room.id)
      add(
        { point: stop.anchor, entityId: stop.doorId!, kind: 'door' },
        transit ? 1 : 3,
        stop.doorId,
      );
    if (
      stop.kind === 'stairs' &&
      stop.approach &&
      contains(room.footprint, stop.approach.position) &&
      nearbyRoute(
        compiled,
        { ...target, position: { ...target.position, y: floor.elevation } },
        stop.approach,
        'current',
      )
    )
      add({ point: stop.anchor, entityId: stop.id, kind: 'stairs' }, 0, stop.id.split(':')[1]);
    if (
      stop.kind === 'waypoint' &&
      stop.roomId === room.id &&
      nearbyRoute(compiled, target, stop.target, 'current')
    )
      add({ point: stop.anchor, entityId: stop.id, kind: 'waypoint' }, 5);
  }
  for (const object of compiled.building.objects.filter((value) => value.roomId === room.id))
    add(
      {
        point: {
          x: object.position.x,
          y: floor.elevation + object.position.y + object.dimensions.height * 0.65,
          z: object.position.z,
        },
        entityId: object.id,
        kind: 'object',
      },
      transit ? 3 : 0,
      object.id,
    );
  const best = candidates.sort((a, b) => a.score - b.score)[0];
  return best ? { point: best.point, kind: best.kind, entityId: best.entityId } : null;
}
