import { buildNavigation, findPath, isWalkable } from '@refloor/engine';
import type { CompiledBuilding, Navigation, NavigationPoint, Point3 } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';
import { clearSegment } from '@refloor/engine/navigation/surfaces';
import { roomViews } from '@/shared/navigation/viewpoints';
import { stairMarker } from '@/shared/navigation/stair-marker';

export type Destination = {
  id: string;
  label: string;
  kind: 'room' | 'door' | 'stairs';
  caption?: string;
  anchor: Point3;
  target: NavigationPoint;
  floorId: string;
  roomId?: string;
  direction?: 'up' | 'down';
  lookAt?: Point3;
  approach?: NavigationPoint;
  doorId?: string;
  stairId?: string;
  bearing?: number;
};
const stops = new WeakMap<CompiledBuilding, Destination[]>();
const graphs = new WeakMap<CompiledBuilding, Map<string, Navigation>>();

export function navigationFor(compiled: CompiledBuilding, policy: 'openable' | 'current') {
  let cached = graphs.get(compiled);
  if (!cached) graphs.set(compiled, (cached = new Map()));
  let graph = cached.get(policy);
  if (!graph) cached.set(policy, (graph = buildNavigation(compiled, policy)));
  return graph;
}

export function destinations(compiled: CompiledBuilding): Destination[] {
  const cached = stops.get(compiled);
  if (cached) return cached;
  const graph = navigationFor(compiled, 'openable'),
    result: Destination[] = [];
  for (const floor of compiled.building.floors) {
    const nodes = (graph.byFloor.get(floor.id) ?? []).map((index) => graph.nodes[index]!);
    for (const room of floor.rooms) {
      for (const [index, view] of roomViews(
        compiled,
        floor,
        room,
        nodes.map((node) => node.position),
      ).entries()) {
        result.push({
          id: index === 0 ? `room:${room.id}` : `room:${room.id}:${index}`,
          label: `Explore ${room.name}`,
          caption: room.name,
          kind: 'room',
          floorId: floor.id,
          roomId: room.id,
          anchor: { ...view.position, y: floor.elevation + 0.06 },
          target: { floorId: floor.id, position: view.position },
          ...(view.lookAt ? { lookAt: view.lookAt } : {}),
        });
      }
    }
    for (const door of compiled.doors.filter((value) => value.floorId === floor.id)) {
      const sides = [-1, 1].map((sign) => {
        const normal = rotate({ x: 0, z: sign }, door.rotation);
        const wall = floor.walls.find((value) => value.id === door.wallId);
        const offset = (wall?.thickness ?? 0.2) / 2 + 0.05;
        const sample = {
          x: door.centre.x + normal.x * offset,
          z: door.centre.z + normal.z * offset,
        };
        const room = floor.rooms.find((value) => contains(value.footprint, sample, 0.01));
        if (!room) return null;
        const desired = {
          x: door.centre.x + normal.x * 0.75,
          y: floor.elevation,
          z: door.centre.z + normal.z * 0.75,
        };
        const centre = { ...door.centre, y: floor.elevation };
        const node = nodes
          .filter((value) => {
            const dx = value.position.x - centre.x,
              dz = value.position.z - centre.z;
            return (
              contains(room.footprint, value.position, 0.05) &&
              dx * normal.x + dz * normal.z > offset &&
              Math.hypot(dx, dz) < 2.2
            );
          })
          .sort(
            (a, b) =>
              Math.hypot(a.position.x - desired.x, a.position.z - desired.z) -
              Math.hypot(b.position.x - desired.x, b.position.z - desired.z),
          )
          .find((value) => clearSegment(compiled, floor.id, centre, value.position, 'openable'));
        return { room, node };
      });
      for (const [index, side] of sides.entries()) {
        const opposite = sides[1 - index];
        if (!side?.node || !opposite?.node || side.room.id === opposite.room.id) continue;
        const normal = rotate({ x: 0, z: index === 0 ? -1 : 1 }, door.rotation);
        const view = result
          .filter((value) => value.kind === 'room' && value.roomId === opposite.room.id)
          .sort(
            (a, b) =>
              Math.hypot(
                a.target.position.x - opposite.node!.position.x,
                a.target.position.z - opposite.node!.position.z,
              ) -
              Math.hypot(
                b.target.position.x - opposite.node!.position.x,
                b.target.position.z - opposite.node!.position.z,
              ),
          )[0];
        result.push({
          id: `door:${door.id}:${index}`,
          label: `${door.open ? 'Enter' : 'Open door to'} ${opposite.room.name}`,
          caption: opposite.room.name,
          kind: 'door',
          doorId: door.id,
          floorId: floor.id,
          roomId: side.room.id,
          anchor: {
            x: door.centre.x + normal.x * 0.25,
            y: floor.elevation + 1,
            z: door.centre.z + normal.z * 0.25,
          },
          bearing: Math.atan2(normal.x, normal.z),
          target: view?.target ?? { floorId: floor.id, position: opposite.node.position },
          approach: { floorId: floor.id, position: side.node.position },
          ...(view?.lookAt ? { lookAt: view.lookAt } : {}),
        });
      }
    }
  }
  for (const stair of compiled.stairs)
    for (const [start, target, direction, path] of [
      [stair.lower, stair.upper, 'up', stair.path],
      [stair.upper, stair.lower, 'down', stair.path.toReversed()],
    ] as const) {
      const arrivalRoom = compiled.building.floors
        .find((floor) => floor.id === target.floorId)
        ?.rooms.find((room) => contains(room.footprint, target.position));
      const facing = result
        .filter(
          (value) =>
            value.floorId === target.floorId &&
            ((value.kind === 'door' && value.roomId === arrivalRoom?.id) || value.kind === 'room'),
        )
        .map((value) => ({
          point: { ...value.anchor, y: target.position.y + 1.35 },
          approach: value.approach ?? value.target,
          portal: value.kind === 'door',
          distance: Math.hypot(
            value.anchor.x - target.position.x,
            value.anchor.z - target.position.z,
          ),
        }))
        .filter(
          (value) =>
            value.distance > 1.5 && nearbyRoute(compiled, target, value.approach, 'openable'),
        )
        .sort((a, b) => Number(b.portal) - Number(a.portal) || a.distance - b.distance)[0];
      result.push({
        id: `stairs:${stair.id}:${direction}`,
        label: direction === 'up' ? 'Go upstairs' : 'Go downstairs',
        caption: direction === 'up' ? 'Upstairs' : 'Downstairs',
        kind: 'stairs',
        stairId: stair.id,
        floorId: start.floorId,
        ...stairMarker(path),
        direction,
        target,
        approach: start,
        ...(facing ? { lookAt: facing.point } : {}),
      });
    }
  stops.set(compiled, result);
  return result;
}

export function nearbyRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  policy: 'openable' | 'current',
) {
  if (clearSegment(compiled, from.floorId, from.position, target.position, policy)) return true;
  const route = destinationRoute(compiled, from, target, policy);
  return Boolean(
    route &&
    !route.stairIds.length &&
    route.length <=
      Math.hypot(from.position.x - target.position.x, from.position.z - target.position.z) * 1.5 +
        1,
  );
}

export function stairContinuation(
  compiled: CompiledBuilding,
  player: NavigationPoint,
): Destination[] {
  for (const stair of compiled.stairs) {
    if (
      player.position.y < stair.lower.position.y + 0.15 ||
      player.position.y > stair.upper.position.y - 0.15
    )
      continue;
    const nearest = stair.path
      .map((point, index) => ({
        index,
        distance: Math.hypot(
          point.x - player.position.x,
          point.y - player.position.y,
          point.z - player.position.z,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 0.75) continue;
    return (
      [
        ['up', stair.upper, stair.path.slice(nearest.index)],
        ['down', stair.lower, stair.path.slice(0, nearest.index + 1).reverse()],
      ] as const
    ).map(([direction, target, path]) => {
      return {
        id: `stairs:${stair.id}:${direction}`,
        label: direction === 'up' ? 'Go upstairs' : 'Go downstairs',
        caption: direction === 'up' ? 'Upstairs' : 'Downstairs',
        kind: 'stairs',
        stairId: stair.id,
        direction,
        floorId: player.floorId,
        target,
        ...stairMarker(path),
      };
    });
  }
  return [];
}

export function destinationRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  policy: 'openable' | 'current',
) {
  const graph = navigationFor(compiled, policy);
  const floor = compiled.building.floors.find((value) => value.id === from.floorId);
  const start = { ...from, position: { ...from.position, y: floor?.elevation ?? from.position.y } };
  if (Math.abs(start.position.y - from.position.y) < 0.15 && isWalkable(compiled, start, policy))
    return findPath(graph, start, target);
  if (floor && Math.abs(start.position.y - from.position.y) < 0.15) {
    const physical = { ...compiled, options: { ...compiled.options, clearance: 0.005 } };
    const candidates = (graph.byFloor.get(floor.id) ?? [])
      .map((index) => graph.nodes[index]!)
      .map((node) => ({
        node,
        distance: Math.hypot(
          node.position.x - start.position.x,
          node.position.z - start.position.z,
        ),
      }))
      .filter((value) => value.distance <= 0.35)
      .sort((a, b) => a.distance - b.distance);
    for (const { node, distance } of candidates) {
      if (!clearSegment(physical, floor.id, start.position, node.position, policy)) continue;
      const route = findPath(graph, node, target);
      if (route)
        return {
          ...route,
          points: [start.position, ...route.points],
          length: route.length + distance,
        };
    }
  }
  for (const stair of compiled.stairs) {
    const nearest = stair.path
      .map((point, index) => ({
        index,
        distance: Math.hypot(
          point.x - from.position.x,
          (point.y - from.position.y) * 1.2,
          point.z - from.position.z,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 0.75) continue;
    const ascending = target.floorId !== stair.lower.floorId,
      landing = ascending ? stair.upper : stair.lower,
      route = findPath(graph, landing, target);
    if (!route) continue;
    const approach = ascending
      ? stair.path.slice(nearest.index)
      : stair.path.slice(0, nearest.index + 1).reverse();
    return { ...route, points: [from.position, ...approach, ...route.points] };
  }
  return null;
}

export function smoothRoute(compiled: CompiledBuilding, points: Point3[]): Point3[] {
  const result: Point3[] = [];
  for (let index = 0; index < points.length;) {
    const point = points[index]!;
    result.push(point);
    const floor = compiled.building.floors.find(
      (value) => Math.abs(value.elevation - point.y) < 0.001,
    );
    let next = index + 1;
    if (floor)
      for (let end = next + 1; end < points.length; end++) {
        if (Math.abs(points[end]!.y - point.y) > 0.001) break;
        if (clearSegment(compiled, floor.id, point, points[end]!, 'current')) next = end;
      }
    index = next;
  }
  return result;
}
