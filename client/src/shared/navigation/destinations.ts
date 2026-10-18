import { buildNavigation, findPath, isWalkable } from '@refloor/engine';
import type { CompiledBuilding, Navigation, NavigationPoint, Point3 } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';
import { clearSegment } from '@refloor/engine/navigation/surfaces';

export type Destination = {
  id: string;
  label: string;
  kind: 'room' | 'door' | 'stairs';
  anchor: Point3;
  target: NavigationPoint;
  floorId: string;
  roomId?: string;
  direction?: 'up' | 'down';
  lookAt?: Point3;
};
const graphs = new WeakMap<CompiledBuilding, Map<string, Navigation>>();

export function navigationFor(compiled: CompiledBuilding, policy: 'openable' | 'current') {
  let cached = graphs.get(compiled);
  if (!cached) graphs.set(compiled, (cached = new Map()));
  let graph = cached.get(policy);
  if (!graph) cached.set(policy, (graph = buildNavigation(compiled, policy)));
  return graph;
}

export function destinations(compiled: CompiledBuilding): Destination[] {
  const graph = navigationFor(compiled, 'openable'),
    result: Destination[] = [];
  for (const floor of compiled.building.floors) {
    const nodes = (graph.byFloor.get(floor.id) ?? []).map((index) => graph.nodes[index]!);
    const nearest = (point: Point3, roomId?: string, radius = Infinity) =>
      nodes
        .filter((node) => {
          const room = floor.rooms.find((value) => value.id === roomId);
          return (
            (!room || contains(room.footprint, node.position, 0.1)) &&
            Math.hypot(point.x - node.position.x, point.z - node.position.z) <= radius
          );
        })
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - point.x, a.position.z - point.z) -
            Math.hypot(b.position.x - point.x, b.position.z - point.z),
        )[0];
    for (const room of floor.rooms) {
      const centre = {
        x: room.footprint.x + room.footprint.width / 2,
        y: floor.elevation,
        z: room.footprint.z + room.footprint.depth / 2,
      };
      const stair = compiled.stairs.find((value) =>
        [value.lower, value.upper].some(
          (landing) => landing.floorId === floor.id && contains(room.footprint, landing.position),
        ),
      );
      const feature = ['television', 'bed', 'sofa', 'table']
        .map((kind) =>
          compiled.building.objects.find(
            (object) => object.roomId === room.id && object.kind === kind,
          ),
        )
        .find((object) => object !== undefined);
      const lookAt = stair
        ? stair.lower.floorId === floor.id
          ? stair.path[2]
          : stair.path.at(-3)
        : (feature?.position ?? centre);
      const columns = Math.max(1, Math.floor(room.footprint.width / 2.2)),
        rows = Math.max(1, Math.floor(room.footprint.depth / 2.2));
      const positions = [centre];
      for (let z = 0; z < rows; z++)
        for (let x = 0; x < columns; x++)
          positions.push({
            x: room.footprint.x + ((x + 0.5) * room.footprint.width) / columns,
            y: floor.elevation,
            z: room.footprint.z + ((z + 0.5) * room.footprint.depth) / rows,
          });
      const placed: Point3[] = [];
      for (const [index, position] of positions.entries()) {
        const node = nearest(position, room.id);
        if (
          !node ||
          placed.some(
            (point) => Math.hypot(point.x - node.position.x, point.z - node.position.z) < 1.5,
          )
        )
          continue;
        placed.push(node.position);
        result.push({
          id: index === 0 ? `room:${room.id}` : `room:${room.id}:${index}`,
          label: `Move to ${room.name}`,
          kind: 'room',
          floorId: floor.id,
          roomId: room.id,
          anchor: { ...node.position, y: floor.elevation + 0.08 },
          target: { floorId: floor.id, position: node.position },
          ...(lookAt ? { lookAt } : {}),
        });
      }
    }
    for (const door of compiled.doors.filter((value) => value.floorId === floor.id)) {
      const sides = [-1, 1].map((sign) => {
        const normal = rotate({ x: 0, z: sign }, door.rotation);
        const desired = {
          x: door.centre.x + normal.x * 1.1,
          y: floor.elevation,
          z: door.centre.z + normal.z * 1.1,
        };
        const room = floor.rooms.find((value) => contains(value.footprint, desired));
        return room ? { room, node: nearest(desired, room.id, 0.8) } : null;
      });
      for (const [index, side] of sides.entries()) {
        const opposite = sides[1 - index];
        if (!side?.node || !opposite?.node || side.room.id === opposite.room.id) continue;
        const normal = rotate({ x: 0, z: index === 0 ? -1 : 1 }, door.rotation);
        result.push({
          id: `door:${door.id}:${index}`,
          label: `Enter ${opposite.room.name}`,
          kind: 'door',
          floorId: floor.id,
          roomId: side.room.id,
          anchor: {
            x: door.centre.x + normal.x * 0.18,
            y: floor.elevation + 1.15,
            z: door.centre.z + normal.z * 0.18,
          },
          target: { floorId: floor.id, position: opposite.node.position },
          lookAt: {
            x: opposite.room.footprint.x + opposite.room.footprint.width / 2,
            y: floor.elevation + 1,
            z: opposite.room.footprint.z + opposite.room.footprint.depth / 2,
          },
        });
      }
    }
  }
  for (const stair of compiled.stairs)
    for (const [start, target, path, direction] of [
      [stair.lower, stair.upper, stair.path, 'up'],
      [stair.upper, stair.lower, stair.path.toReversed(), 'down'],
    ] as const) {
      const anchor = path[Math.min(3, path.length - 1)]!;
      const facing = result
        .filter((value) => value.kind === 'room' && value.floorId === target.floorId)
        .map((value) => ({
          point: value.target.position,
          distance: Math.hypot(
            value.target.position.x - target.position.x,
            value.target.position.z - target.position.z,
          ),
        }))
        .filter(
          (value) =>
            value.distance > 1.5 &&
            clearSegment(compiled, target.floorId, target.position, value.point, 'openable'),
        )
        .sort((a, b) => a.distance - b.distance)[0];
      result.push({
        id: `stairs:${stair.id}:${direction}`,
        label: direction === 'up' ? 'Go upstairs' : 'Go downstairs',
        kind: 'stairs',
        floorId: start.floorId,
        anchor: { ...anchor, y: start.position.y + 0.75 },
        direction,
        target,
        ...(facing ? { lookAt: facing.point } : {}),
      });
    }
  return result;
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
        ['up', stair.upper, 8],
        ['down', stair.lower, -8],
      ] as const
    ).map(([direction, target, offset]) => {
      const anchor =
        stair.path[Math.max(0, Math.min(stair.path.length - 1, nearest.index + offset))]!;
      return {
        id: `stairs:${stair.id}:${direction}`,
        label: direction === 'up' ? 'Go upstairs' : 'Go downstairs',
        kind: 'stairs',
        direction,
        floorId: player.floorId,
        target,
        anchor: { ...anchor, y: anchor.y + 0.4 },
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
