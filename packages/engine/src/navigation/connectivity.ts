import { boxPolygon, distance } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import { fail } from '@refloor/engine/errors';
import { clearSegment, isWalkable } from '@refloor/engine/navigation/surfaces';
import {
  restoreTopology,
  snapshotTopology,
  topologyKey,
} from '@refloor/engine/navigation/topology';
import type { CompiledBuilding, Navigation, NavigationPoint } from '@refloor/engine/types';

const graphs = new WeakMap<
  CompiledBuilding,
  Partial<Record<Navigation['doorPolicy'], Navigation>>
>();
let openable: { key: string; topology: ReturnType<typeof snapshotTopology> } | null = null;

export function nearestNode(navigation: Navigation, point: NavigationPoint): number | null {
  if (!isWalkable(navigation.compiled, point, navigation.doorPolicy)) return null;
  const candidates = (navigation.byFloor.get(point.floorId) ?? [])
    .map((index) => ({ index, node: navigation.nodes[index] }))
    .filter((value) => value.node !== undefined)
    .map((value) => ({
      index: value.index,
      node: value.node,
      distance: value.node ? distance(value.node.position, point.position) : Infinity,
    }))
    .filter((value) => value.distance <= navigation.compiled.options.resolution * 2)
    .sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates)
    if (
      candidate.node &&
      clearSegment(
        navigation.compiled,
        point.floorId,
        point.position,
        candidate.node.position,
        navigation.doorPolicy,
      )
    )
      return candidate.index;
  return null;
}

export function buildNavigation(
  compiled: CompiledBuilding,
  doorPolicy: 'openable' | 'current' = 'openable',
): Navigation {
  let cached = graphs.get(compiled);
  if (!cached) graphs.set(compiled, (cached = {}));
  const existing = cached[doorPolicy];
  if (existing) return existing;
  const key = doorPolicy === 'openable' ? topologyKey(compiled) : null;
  if (key !== null && openable?.key === key) {
    const navigation = restoreTopology(openable.topology, compiled);
    cached[doorPolicy] = navigation;
    return navigation;
  }
  const navigation = computeNavigation(compiled, doorPolicy);
  cached[doorPolicy] = navigation;
  if (key !== null) openable = { key, topology: snapshotTopology(navigation) };
  return navigation;
}

function computeNavigation(
  compiled: CompiledBuilding,
  doorPolicy: 'openable' | 'current',
): Navigation {
  const navigation: Navigation = {
    compiled,
    nodes: [],
    byFloor: new Map(),
    grids: new Map(),
    doorPolicy,
  };
  const resolution = compiled.options.resolution;
  const axes = compiled.building.floors.map((floor) => {
    const regularCount =
      Math.ceil(floor.footprint.width / resolution) * Math.ceil(floor.footprint.depth / resolution);
    if (regularCount > compiled.options.maxNodes)
      fail('NAVIGATION_LIMIT', floor.id, 'Floor exceeds the navigation node budget');
    const xs = Array.from(
      { length: Math.ceil(floor.footprint.width / resolution) },
      (_, i) => floor.footprint.x + (i + 0.5) * resolution,
    );
    const zs = Array.from(
      { length: Math.ceil(floor.footprint.depth / resolution) },
      (_, i) => floor.footprint.z + (i + 0.5) * resolution,
    );
    const margin = compiled.options.radius + compiled.options.clearance + 0.0001;
    for (const collider of compiled.colliders) {
      if (collider.role === 'stair-railing') continue;
      if (doorPolicy === 'openable' && collider.role === 'door') continue;
      const box = colliderBounds(collider);
      if (
        box.position.y + box.size.y / 2 <= floor.elevation + compiled.options.stepHeight ||
        box.position.y - box.size.y / 2 >= floor.elevation + compiled.options.headroom
      )
        continue;
      const polygon = boxPolygon(box),
        px = polygon.map((p) => p.x),
        pz = polygon.map((p) => p.z);
      xs.push(Math.min(...px) - margin, Math.max(...px) + margin);
      zs.push(Math.min(...pz) - margin, Math.max(...pz) + margin);
    }
    for (const stair of compiled.stairs) {
      if (stair.lower.floorId === floor.id || stair.upper.floorId === floor.id) {
        const rect = stair.footprint,
          padding = margin + 0.045;
        xs.push(rect.x - padding, rect.x + rect.width + padding);
        zs.push(rect.z - padding, rect.z + rect.depth + padding);
      }
      for (const landing of [stair.lower, stair.upper])
        if (landing.floorId === floor.id) {
          xs.push(landing.position.x);
          zs.push(landing.position.z);
        }
    }
    for (const door of compiled.doors)
      if (door.floorId === floor.id) {
        xs.push(door.centre.x);
        zs.push(door.centre.z);
      }
    const distinct = (values: number[], min: number, max: number) =>
      values
        .filter((value) => value > min && value < max)
        .sort((a, b) => a - b)
        .filter((value, i, sorted) => i === 0 || value - (sorted[i - 1] ?? value) > 0.00001);
    return {
      floor,
      xs: distinct(xs, floor.footprint.x, floor.footprint.x + floor.footprint.width),
      zs: distinct(zs, floor.footprint.z, floor.footprint.z + floor.footprint.depth),
    };
  });
  const estimate = axes.reduce((sum, axis) => sum + axis.xs.length * axis.zs.length, 0);
  if (estimate * compiled.colliders.length > 25_000_000)
    fail(
      'NAVIGATION_LIMIT',
      compiled.building.id,
      'Navigation exceeds the configured node or geometry budget',
    );
  for (const { floor, xs, zs } of axes) {
    const grid = new Map<string, number>(),
      indices: number[] = [];
    navigation.grids.set(floor.id, grid);
    navigation.byFloor.set(floor.id, indices);
    for (const [zi, z] of zs.entries())
      for (const [xi, x] of xs.entries()) {
        const point = { floorId: floor.id, position: { x, y: floor.elevation, z } };
        if (!isWalkable(compiled, point, doorPolicy)) continue;
        if (navigation.nodes.length >= compiled.options.maxNodes)
          fail(
            'NAVIGATION_LIMIT',
            compiled.building.id,
            'Building exceeds the navigation node budget',
          );
        const index = navigation.nodes.length;
        navigation.nodes.push({ ...point, edges: [] });
        grid.set(`${xi}:${zi}`, index);
        indices.push(index);
      }
    for (const [key, index] of grid) {
      const [x = 0, z = 0] = key.split(':').map(Number),
        node = navigation.nodes[index];
      if (!node) continue;
      for (const [dx = 0, dz = 0] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const target = grid.get(`${x + dx}:${z + dz}`),
          neighbour = target === undefined ? undefined : navigation.nodes[target];
        if (
          target !== undefined &&
          neighbour &&
          clearSegment(compiled, floor.id, node.position, neighbour.position, doorPolicy)
        )
          node.edges.push({ to: target, cost: distance(node.position, neighbour.position) });
      }
    }
  }
  for (const stair of compiled.stairs) {
    const lower = nearestNode(navigation, stair.lower),
      upper = nearestNode(navigation, stair.upper);
    if (lower === null || upper === null) continue;
    const a = navigation.nodes[lower],
      b = navigation.nodes[upper];
    if (!a || !b) continue;
    const path = [a.position, ...stair.path, b.position];
    const cost = path
      .slice(1)
      .reduce((sum, point, i) => sum + distance(path[i] ?? point, point), 0);
    a.edges.push({ to: upper, cost, stairId: stair.id, path });
    b.edges.push({ to: lower, cost, stairId: stair.id, path: path.toReversed() });
  }
  return navigation;
}

export function reachableNodes(navigation: Navigation, start: number): Set<number> {
  const found = new Set([start]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const node = navigation.nodes[queue[i] ?? -1];
    if (!node) continue;
    for (const edge of node.edges)
      if (!found.has(edge.to)) {
        found.add(edge.to);
        queue.push(edge.to);
      }
  }
  return found;
}
