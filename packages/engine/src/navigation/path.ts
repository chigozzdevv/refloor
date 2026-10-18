import { distance, rotate } from '@refloor/engine/math';
import { nearestNode } from '@refloor/engine/navigation/connectivity';
import { MinHeap } from '@refloor/engine/navigation/heap';
import type { Navigation, NavigationPath, NavigationPoint, Point3 } from '@refloor/engine/types';

export function findPath(
  navigation: Navigation,
  from: NavigationPoint,
  to: NavigationPoint,
): NavigationPath | null {
  const start = nearestNode(navigation, from),
    target = nearestNode(navigation, to);
  if (start === null || target === null) return null;
  const costs = new Float64Array(navigation.nodes.length).fill(Infinity),
    parents = new Int32Array(navigation.nodes.length).fill(-1);
  const heap = new MinHeap();
  costs[start] = 0;
  heap.push(start, 0);
  while (true) {
    const next = heap.pop();
    if (!next) return null;
    if (next.index === target) break;
    const node = navigation.nodes[next.index];
    if (!node) continue;
    for (const edge of node.edges) {
      const cost = (costs[next.index] ?? Infinity) + edge.cost;
      if (cost >= (costs[edge.to] ?? Infinity)) continue;
      costs[edge.to] = cost;
      parents[edge.to] = next.index;
      const neighbour = navigation.nodes[edge.to];
      heap.push(edge.to, cost + (neighbour ? distance(neighbour.position, to.position) : 0));
    }
  }
  const route = [target];
  while (route[route.length - 1] !== start) {
    const parent = parents[route[route.length - 1] ?? -1];
    if (parent === undefined || parent < 0) return null;
    route.push(parent);
  }
  route.reverse();
  const points: Point3[] = [from.position],
    stairIds = new Set<string>();
  for (let i = 0; i < route.length; i++) {
    const node = navigation.nodes[route[i] ?? -1];
    if (!node) continue;
    const previous = navigation.nodes[route[i - 1] ?? -1],
      edge = previous?.edges.find((value) => value.to === route[i]);
    if (edge?.stairId && edge.path) {
      stairIds.add(edge.stairId);
      points.push(...edge.path);
    } else points.push(node.position);
  }
  points.push(to.position);
  const doorIds = new Set<string>();
  for (const door of navigation.compiled.doors) {
    if (door.open) continue;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (!a || !b) continue;
      const p = rotate({ x: a.x - door.centre.x, z: a.z - door.centre.z }, -door.rotation),
        q = rotate({ x: b.x - door.centre.x, z: b.z - door.centre.z }, -door.rotation);
      if (p.z * q.z > 0 || Math.abs(p.z - q.z) < 1e-6) continue;
      const t = p.z / (p.z - q.z),
        x = p.x + (q.x - p.x) * t,
        y = a.y + (b.y - a.y) * t;
      if (
        Math.abs(x) < door.width / 2 &&
        y >= door.centre.y - 0.01 &&
        y < door.centre.y + door.height
      )
        doorIds.add(door.id);
    }
  }
  return {
    points,
    doorIds: [...doorIds],
    stairIds: [...stairIds],
    length: points.slice(1).reduce((sum, point, i) => sum + distance(points[i] ?? point, point), 0),
  };
}
