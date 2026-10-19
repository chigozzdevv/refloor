import type { CompiledBuilding, NavigationPoint, Point3 } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { destinationRoute, destinations, nearbyRoute } from '@/shared/navigation/destinations';
import { clearView } from '@/shared/navigation/viewpoints';
import { entryPose } from '@/shared/navigation/entry';

export type ArrivalView = {
  point: Point3;
  entityId: string;
  kind: 'door' | 'stairs' | 'object' | 'route';
};

export function arrivalView(
  compiled: CompiledBuilding,
  target: NavigationPoint,
  preferred?: Point3,
  entryDoorId?: string,
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
      score: priority + distance * 0.12 - (preferredDistance < 0.75 ? 6 : 0),
    });
  };
  for (const stop of destinations(compiled)) {
    if (stop.floorId !== floor.id) continue;
    if (
      stop.kind === 'door' &&
      stop.roomId === room.id &&
      stop.doorId !== entryDoorId &&
      stop.approach &&
      nearbyRoute(compiled, target, stop.approach, 'current')
    )
      add(
        {
          point: { ...stop.anchor, y: floor.elevation + 1.35 },
          entityId: stop.doorId!,
          kind: 'door',
        },
        transit ? 0 : 8,
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
      add(
        { point: { ...stop.anchor, y: floor.elevation + 1.1 }, entityId: stop.id, kind: 'stairs' },
        transit ? 2 : 8,
        stop.stairId,
      );
  }
  for (const object of compiled.building.objects.filter(
    (value) => value.roomId === room.id && value.kind !== 'light',
  ))
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
      transit ? 8 : ['television', 'bed', 'sofa', 'table'].includes(object.kind) ? 0 : 6,
      object.id,
    );
  if (!candidates.length) {
    const stops = destinations(compiled).filter(
      (stop) =>
        stop.floorId === floor.id &&
        (stop.kind === 'room'
          ? stop.roomId === room.id
          : stop.kind === 'door'
            ? stop.roomId === room.id && stop.doorId !== entryDoorId
            : stop.approach && contains(room.footprint, stop.approach.position)),
    );
    for (const stop of stops) {
      const route = destinationRoute(compiled, target, stop.approach ?? stop.target, 'current');
      if (!route || route.stairIds.length) continue;
      for (const point of route.points.toReversed()) {
        const count = candidates.length;
        add(
          { point: { ...point, y: floor.elevation + 1.25 }, entityId: stop.id, kind: 'route' },
          6 + route.length * 0.1,
        );
        if (candidates.length > count) break;
      }
    }
  }
  const best = candidates.sort((a, b) => a.score - b.score)[0];
  return best ? { point: best.point, kind: best.kind, entityId: best.entityId } : null;
}

export function entranceArrival(compiled: CompiledBuilding): Point3 {
  const entry = entryPose(compiled),
    view = arrivalView(
      compiled,
      { floorId: entry.floorId, position: entry.inside },
      undefined,
      entry.doorId,
    );
  if (view) return view.point;
  return {
    x: entry.inside.x + entry.normal.x * 4,
    y: entry.inside.y + 1.3,
    z: entry.inside.z + entry.normal.z * 4,
  };
}
