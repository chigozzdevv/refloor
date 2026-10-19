import { isWalkable, nearestNode, reachableNodes } from '@refloor/engine';
import type {
  CompiledBuilding,
  DoorPortal,
  Navigation,
  NavigationPath,
  NavigationPoint,
  Point3,
} from '@refloor/engine';
import { blockingCollider } from '@refloor/engine/collision/probes';
import { contains, distance, rotate } from '@refloor/engine/math';
import { doorCrossings } from '@refloor/engine/navigation/doors';
import { MinHeap } from '@refloor/engine/navigation/heap';
import { compoundFootprint } from '@refloor/engine/site';
import { clearSegment } from '@refloor/engine/navigation/surfaces';

function compoundSpace(compiled: CompiledBuilding, policy: Navigation['doorPolicy']) {
  const ground = compiled.building.floors.reduce((a, b) => (a.elevation < b.elevation ? a : b)),
    compound = compoundFootprint(compiled.building),
    margin = compiled.options.radius + compiled.options.clearance;
  const valid = (point: Point3, outsideOnly = true) =>
    contains(compound, point, margin) &&
    (!outsideOnly || !contains(ground.footprint, point)) &&
    !blockingCollider(compiled, { ...point, y: ground.elevation }, policy);
  const clear = (a: Point3, b: Point3, outsideOnly = true) => {
    const count = Math.max(1, Math.ceil(distance(a, b) / (compiled.options.resolution / 2)));
    for (let step = 0; step <= count; step++) {
      const t = step / count;
      if (
        !valid(
          { x: a.x + (b.x - a.x) * t, y: ground.elevation, z: a.z + (b.z - a.z) * t },
          outsideOnly,
        )
      )
        return false;
    }
    return true;
  };
  return { ground, compound, valid, clear };
}

export function compoundPath(
  compiled: CompiledBuilding,
  from: Point3,
  target: Point3,
  policy: Navigation['doorPolicy'],
): Point3[] | null {
  const { ground, compound, valid, clear } = compoundSpace(compiled, policy);
  if (!valid(from) || !valid(target)) return null;
  if (clear(from, target)) return [from, target];
  const resolution = Math.max(0.3, compiled.options.resolution),
    width = Math.ceil(compound.width / resolution),
    depth = Math.ceil(compound.depth / resolution);
  if (width * depth > compiled.options.maxNodes) return null;
  const points: (Point3 | null)[] = Array.from({ length: width * depth }, (_, index) => {
    const point = {
      x: compound.x + ((index % width) + 0.5) * resolution,
      y: ground.elevation,
      z: compound.z + (Math.floor(index / width) + 0.5) * resolution,
    };
    return valid(point) ? point : null;
  });
  const costs = new Float64Array(points.length).fill(Infinity),
    parents = new Int32Array(points.length).fill(-1),
    heap = new MinHeap();
  for (const [index, point] of points.entries()) {
    if (!point || distance(from, point) > resolution * 2 || !clear(from, point)) continue;
    costs[index] = distance(from, point);
    heap.push(index, costs[index]! + distance(point, target));
  }
  while (true) {
    const next = heap.pop();
    if (!next) return null;
    const point = points[next.index]!;
    if (distance(point, target) <= resolution * 2 && clear(point, target)) {
      const route = [target, point];
      let parent = parents[next.index]!;
      while (parent !== -1) {
        route.push(points[parent]!);
        parent = parents[parent]!;
      }
      return [from, ...route.reverse()];
    }
    const x = next.index % width,
      z = Math.floor(next.index / width);
    for (const [dx = 0, dz = 0] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      if (x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= depth) continue;
      const index = next.index + dx + dz * width,
        candidate = points[index];
      if (!candidate || !clear(point, candidate)) continue;
      const cost = costs[next.index]! + distance(point, candidate);
      if (cost >= costs[index]!) continue;
      costs[index] = cost;
      parents[index] = next.index;
      heap.push(index, cost + distance(candidate, target));
    }
  }
}

function doorApproaches(compiled: CompiledBuilding, door: DoorPortal) {
  const { ground, valid } = compoundSpace(compiled, 'openable');
  if (door.floorId !== ground.id) return [];
  for (const sign of [-1, 1]) {
    const normal = rotate({ x: 0, z: sign }, door.rotation),
      sample = { x: door.centre.x + normal.x * 0.6, z: door.centre.z + normal.z * 0.6 };
    if (contains(ground.footprint, sample)) continue;
    const opposite = { x: door.centre.x - normal.x * 0.6, z: door.centre.z - normal.z * 0.6 };
    if (!contains(ground.footprint, opposite)) continue;
    return [door.width + compiled.options.radius + 0.2, 1.8, 2.2]
      .flatMap((offset) =>
        [0, -0.6, 0.6, -1, 1].map((side) => ({
          x: door.centre.x + normal.x * offset + normal.z * side,
          y: ground.elevation,
          z: door.centre.z + normal.z * offset - normal.x * side,
        })),
      )
      .filter((point) => valid(point));
  }
  return [];
}

export function compoundDoorApproach(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  door: DoorPortal,
) {
  for (const position of doorApproaches(compiled, door)) {
    const points = compoundPath(compiled, from.position, position, 'current');
    if (points) return { floorId: door.floorId, position };
  }
  return null;
}

export function compoundDoorExit(compiled: CompiledBuilding, door: DoorPortal) {
  const position = doorApproaches(compiled, door)[0];
  return position ? { floorId: door.floorId, position } : null;
}

export function compoundRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  navigation: Navigation,
  indoorRoute: (from: NavigationPoint, target: NavigationPoint) => NavigationPath | null,
): NavigationPath | null | undefined {
  const { ground, clear } = compoundSpace(compiled, navigation.doorPolicy),
    outside = (point: NavigationPoint) =>
      point.floorId === ground.id && !contains(ground.footprint, point.position),
    startOutside = outside(from),
    endOutside = outside(target);
  if (!startOutside && !endOutside) return undefined;
  if (startOutside && endOutside) {
    const points = compoundPath(compiled, from.position, target.position, navigation.doorPolicy);
    return points ? path(compiled, points, []) : null;
  }
  const outdoor = startOutside ? from : target,
    inside = startOutside ? target : from,
    floor = compiled.building.floors.find((value) => value.id === inside.floorId),
    indoor = {
      ...inside,
      position: { ...inside.position, y: floor?.elevation ?? inside.position.y },
    };
  const physical = { ...compiled, options: { ...compiled.options, clearance: 0.005 } },
    seed =
      nearestNode(navigation, indoor) ??
      (navigation.byFloor.get(indoor.floorId) ?? [])
        .map((index) => ({
          index,
          point: navigation.nodes[index]!,
          distance: distance(navigation.nodes[index]!.position, indoor.position),
        }))
        .filter((value) => value.distance <= 0.35)
        .sort((a, b) => a.distance - b.distance)
        .find(({ point }) =>
          clearSegment(
            physical,
            indoor.floorId,
            indoor.position,
            point.position,
            navigation.doorPolicy,
          ),
        )?.index,
    reached = seed === undefined ? null : reachableNodes(navigation, seed);
  for (const door of compiled.doors) {
    if (navigation.doorPolicy === 'current' && !door.open) continue;
    const approaches = doorApproaches(compiled, door);
    if (!approaches.length) continue;
    const nodes = (navigation.byFloor.get(ground.id) ?? [])
      .filter((index) => !reached || reached.has(index))
      .map((index) => navigation.nodes[index]!)
      .filter(
        (node) =>
          distance(node.position, door.centre) < 2.3 &&
          isWalkable(compiled, node, navigation.doorPolicy),
      )
      .sort((a, b) => distance(a.position, door.centre) - distance(b.position, door.centre));
    if (!nodes.length) continue;
    for (const approach of approaches) {
      const outsidePath = compoundPath(compiled, outdoor.position, approach, navigation.doorPolicy);
      if (!outsidePath) continue;
      for (const node of nodes) {
        const centre = { ...door.centre, y: ground.elevation };
        if (!clear(approach, centre, false) || !clear(centre, node.position, false)) continue;
        const interior = startOutside ? indoorRoute(node, indoor) : indoorRoute(inside, node);
        if (!interior) continue;
        const points = [
          ...outsidePath,
          centre,
          ...(startOutside ? interior.points : interior.points.toReversed()),
        ];
        return path(compiled, startOutside ? points : points.reverse(), interior.stairIds);
      }
    }
  }
  return null;
}

function path(compiled: CompiledBuilding, points: Point3[], stairIds: string[]): NavigationPath {
  return {
    points,
    stairIds,
    doorIds: doorCrossings(compiled, points)
      .filter(({ door }) => !door.open)
      .map(({ door }) => door.id),
    length: points.slice(1).reduce((sum, point, index) => sum + distance(points[index]!, point), 0),
  };
}
