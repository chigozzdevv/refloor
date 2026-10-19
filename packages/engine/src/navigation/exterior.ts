import { fail } from '@refloor/engine/errors';
import { blockingCollider } from '@refloor/engine/collision/probes';
import { contains, distance, rotate } from '@refloor/engine/math';
import { compoundFootprint } from '@refloor/engine/site';
import { nearestNode } from '@refloor/engine/navigation/connectivity';
import type { Navigation, Point3 } from '@refloor/engine/types';
import { topologyKey } from '@refloor/engine/navigation/topology';

let cache: { key: string; access: (point: Point3) => boolean } | null = null;

export function exteriorInteractionAccess(navigation: Navigation, reached: Set<number>) {
  const { compiled } = navigation,
    ground = compiled.building.floors.reduce((a, b) => (a.elevation < b.elevation ? a : b)),
    compound = compoundFootprint(compiled.building),
    resolution = Math.max(0.3, compiled.options.resolution),
    margin = compiled.options.radius + compiled.options.clearance,
    valid = (point: Point3) =>
      contains(compound, point, margin) &&
      !contains(ground.footprint, point) &&
      !blockingCollider(compiled, point, 'openable');
  const clear = (a: Point3, b: Point3) => {
    const count = Math.max(1, Math.ceil(distance(a, b) / (resolution / 2)));
    for (let i = 0; i <= count; i++)
      if (
        !valid({ x: a.x + ((b.x - a.x) * i) / count, y: a.y, z: a.z + ((b.z - a.z) * i) / count })
      )
        return false;
    return true;
  };
  const seeds: Point3[] = [];
  for (const door of compiled.doors) {
    if (door.floorId !== ground.id) continue;
    for (const sign of [-1, 1]) {
      const delta = rotate({ x: 0, z: sign * (margin + 0.18) }, door.rotation);
      const inside = {
        x: door.centre.x - delta.x,
        y: ground.elevation,
        z: door.centre.z - delta.z,
      };
      const outside = {
        x: door.centre.x + delta.x,
        y: ground.elevation - 0.095,
        z: door.centre.z + delta.z,
      };
      if (!valid(outside)) continue;
      const index = nearestNode(navigation, { floorId: ground.id, position: inside });
      if (index !== null && reached.has(index)) seeds.push(outside);
    }
  }
  if (!seeds.length) return () => false;
  const key = `${topologyKey(compiled)}:${JSON.stringify(seeds)}`;
  if (cache?.key === key) return cache.access;
  if (
    Math.ceil(compound.width / resolution) * Math.ceil(compound.depth / resolution) >
    compiled.options.maxNodes
  )
    fail('NAVIGATION_LIMIT', ground.id, 'Compound exceeds the exterior interaction node budget');
  const xs = Array.from(
    { length: Math.ceil(compound.width / resolution) },
    (_, i) => compound.x + (i + 0.5) * resolution,
  );
  const zs = Array.from(
    { length: Math.ceil(compound.depth / resolution) },
    (_, i) => compound.z + (i + 0.5) * resolution,
  );
  const points = new Map<string, Point3>();
  for (const [xi, x] of xs.entries())
    for (const [zi, z] of zs.entries()) {
      const point = { x, y: ground.elevation - 0.095, z };
      if (valid(point)) points.set(`${xi}:${zi}`, point);
    }
  const visited = new Set<string>(),
    queue: string[] = [];
  for (const [key, point] of points)
    if (seeds.some((seed) => distance(seed, point) < resolution * 2 && clear(seed, point))) {
      visited.add(key);
      queue.push(key);
    }
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!,
      point = points.get(key)!;
    const [xi = 0, zi = 0] = key.split(':').map(Number);
    for (const [dx = 0, dz = 0] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nextKey = `${xi + dx}:${zi + dz}`,
        next = points.get(nextKey);
      if (next && !visited.has(nextKey) && clear(point, next)) {
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }
  }
  const accessible = queue.map((key) => points.get(key)!);
  const access = (point: Point3) => {
    const target = { ...point, y: ground.elevation - 0.095 };
    return (
      valid(target) &&
      accessible.some((node) => distance(node, target) < resolution * 2 && clear(node, target))
    );
  };
  cache = { key, access };
  return access;
}
