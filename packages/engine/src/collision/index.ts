import { boxPolygon } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import type { Collider, CompiledBuilding, Point3 } from '@refloor/engine/types';

type Index = { cells: Map<string, Collider[]>; large: Collider[] };
const indexes = new WeakMap<CompiledBuilding, Index>();
const cellSize = 2;

export function collisionCandidates(compiled: CompiledBuilding, point: Point3): Collider[] {
  let index = indexes.get(compiled);
  if (!index) {
    index = { cells: new Map(), large: [] };
    const margin = compiled.options.radius + compiled.options.clearance;
    for (const collider of compiled.colliders) {
      const polygon = boxPolygon(colliderBounds(collider)),
        xs = polygon.map((p) => p.x),
        zs = polygon.map((p) => p.z);
      const minX = Math.floor((Math.min(...xs) - margin) / cellSize),
        maxX = Math.floor((Math.max(...xs) + margin) / cellSize),
        minZ = Math.floor((Math.min(...zs) - margin) / cellSize),
        maxZ = Math.floor((Math.max(...zs) + margin) / cellSize);
      if (
        ![minX, maxX, minZ, maxZ].every(Number.isSafeInteger) ||
        (maxX - minX + 1) * (maxZ - minZ + 1) > 10_000
      ) {
        index.large.push(collider);
        continue;
      }
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x}:${z}`,
            cell = index.cells.get(key);
          if (cell) cell.push(collider);
          else index.cells.set(key, [collider]);
        }
    }
    indexes.set(compiled, index);
  }
  const cell =
    index.cells.get(`${Math.floor(point.x / cellSize)}:${Math.floor(point.z / cellSize)}`) ?? [];
  return index.large.length ? [...cell, ...index.large] : cell;
}
