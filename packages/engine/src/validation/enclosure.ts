import { epsilon } from '@refloor/engine/math';
import type { CompiledBuilding, EngineIssue } from '@refloor/engine/types';

export function checkEnclosure(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [];
  for (const floor of compiled.building.floors) {
    const { x, z, width, depth } = floor.footprint;
    const edges = [
      { axis: 'x' as const, fixed: 'z' as const, value: z, from: x, to: x + width },
      { axis: 'x' as const, fixed: 'z' as const, value: z + depth, from: x, to: x + width },
      { axis: 'z' as const, fixed: 'x' as const, value: x, from: z, to: z + depth },
      { axis: 'z' as const, fixed: 'x' as const, value: x + width, from: z, to: z + depth },
    ];
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
