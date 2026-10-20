import type { CompiledBuilding, NavigationPoint, Point3 } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { destinationRoute, destinations, nearbyRoute } from '@/shared/navigation/destinations';
import {
  clearView,
  comfortableLookAt,
  objectLookAt,
  roomObjectPriority,
} from '@/shared/navigation/viewpoints';
import { entryPose } from '@/shared/navigation/entry';
import { tourPortals } from '@/shared/navigation/portals';

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
  entryStairId?: string,
): ArrivalView | null {
  const floor = compiled.building.floors.find((value) => value.id === target.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, target.position));
  if (!floor) return null;
  const from = { ...target.position, y: target.position.y + 1.62 };
  if (!room) {
    const exterior = compiled.building.objects
      .filter((object) => object.floorId === floor.id && object.placement === 'exterior')
      .map((object) => ({
        object,
        point: {
          x: object.position.x,
          y: floor.elevation + object.position.y + object.dimensions.height * 0.65,
          z: object.position.z,
        },
        distance: Math.hypot(object.position.x - from.x, object.position.z - from.z),
      }))
      .filter(
        (value) =>
          value.distance > 0.65 &&
          value.distance < 10 &&
          clearView(compiled, from, value.point, value.object.id),
      )
      .sort(
        (a, b) =>
          Number(a.object.kind === 'light') - Number(b.object.kind === 'light') ||
          Math.round(a.distance * 10) - Math.round(b.distance * 10) ||
          a.object.id.localeCompare(b.object.id),
      )[0];
    if (exterior) return { point: exterior.point, entityId: exterior.object.id, kind: 'object' };
    const entry = entryPose(compiled);
    return entry.floorId === floor.id && clearView(compiled, from, entry.target, entry.doorId)
      ? { point: entry.target, entityId: entry.doorId, kind: 'door' }
      : null;
  }
  const transit = room.kind === 'corridor' || room.kind === 'stairwell';
  const links = tourPortals(compiled, target, destinations(compiled));
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
      score: priority + distance * 0.12 - (preferredDistance < 0.75 ? (transit ? 6 : 0.5) : 0),
    });
  };
  const entry = entryPose(compiled);
  if (
    preferred &&
    entry.floorId === target.floorId &&
    Math.hypot(target.position.x - entry.inside.x, target.position.z - entry.inside.z) < 0.5 &&
    Math.hypot(
      preferred.x - entry.target.x,
      preferred.y - entry.target.y,
      preferred.z - entry.target.z,
    ) < 0.1
  )
    add({ point: entry.target, entityId: entry.doorId, kind: 'door' }, 0, entry.doorId);
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
        transit ? (Math.hypot(stop.anchor.x - from.x, stop.anchor.z - from.z) < 3.35 ? 0 : 14) : 8,
        stop.doorId,
      );
    if (
      stop.kind === 'stairs' &&
      stop.stairId !== entryStairId &&
      !links.some((link) => link.id === stop.id && link.kind === 'waypoint') &&
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
  if (transit)
    for (const waypoint of links)
      if (waypoint.kind === 'waypoint' && (!entryStairId || waypoint.stairId !== entryStairId))
        add(
          {
            point: { ...waypoint.anchor, y: floor.elevation + 1.1 },
            entityId: `approach:${waypoint.id}`,
            kind: 'route',
          },
          2,
        );
  for (const object of compiled.building.objects.filter(
    (value) => value.roomId === room.id && value.kind !== 'light',
  ))
    add(
      {
        point: comfortableLookAt(from, objectLookAt(floor, object)),
        entityId: object.id,
        kind: 'object',
      },
      transit ? 8 : roomObjectPriority(room, object),
      object.id,
    );
  if (!candidates.length) {
    const stops = destinations(compiled).filter(
      (stop) =>
        stop.floorId === floor.id &&
        (!entryStairId || stop.stairId !== entryStairId) &&
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
  if (view) {
    const dx = view.point.x - entry.inside.x,
      dz = view.point.z - entry.inside.z,
      distance = Math.hypot(dx, dz),
      forward = dx * entry.normal.x + dz * entry.normal.z;
    if (distance > 1.6 && forward > 1 && forward / distance > 0.7) return view.point;
  }
  return {
    x: entry.inside.x + entry.normal.x * 4,
    y: entry.inside.y + 1.3,
    z: entry.inside.z + entry.normal.z * 4,
  };
}
