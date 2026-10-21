import { epsilon } from '@refloor/engine/math';
import type { CompiledBuilding, EngineIssue } from '@refloor/engine/types';
import { floorBoundary } from '@refloor/scene/footprint';

export function checkEnclosure(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [];
  for (const floor of compiled.building.floors) {
    const edges = floorBoundary(floor).map(({ start, end }) => {
      const axis = start.z === end.z ? ('x' as const) : ('z' as const),
        fixed = axis === 'x' ? ('z' as const) : ('x' as const);
      return {
        axis,
        fixed,
        value: start[fixed],
        from: Math.min(start[axis], end[axis]),
        to: Math.max(start[axis], end[axis]),
      };
    });
    for (const edge of edges) {
      const intervals = floor.walls
        .filter(
          (wall) =>
            wall.height >= floor.height - epsilon &&
            Math.abs(wall.start[edge.fixed] - edge.value) <= epsilon &&
            Math.abs(wall.end[edge.fixed] - edge.value) <= epsilon,
        )
        .map(
          (wall) =>
            [
              Math.min(wall.start[edge.axis], wall.end[edge.axis]),
              Math.max(wall.start[edge.axis], wall.end[edge.axis]),
            ] as const,
        )
        .sort((a, b) => a[0] - b[0]);
      let end = edge.from;
      for (const interval of intervals) {
        if (interval[0] > end + epsilon) break;
        end = Math.max(end, interval[1]);
      }
      if (end < edge.to - epsilon)
        issues.push({
          code: 'OPEN_PERIMETER',
          entityId: floor.id,
          message: `Floor perimeter at ${edge.fixed}=${edge.value} needs full-height walls`,
        });
    }
  }
  return issues;
}
