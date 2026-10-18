import { contains } from '@refloor/engine/math';
import { blockingCollider, standingBlocked } from '@refloor/engine/collision/probes';
import type { CompiledBuilding, EngineIssue } from '@refloor/engine/types';

export function checkStairClearance(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [],
    profile = compiled.options;
  for (const stair of compiled.stairs) {
    let blocked: string | undefined;
    for (let i = 1; i < stair.path.length && !blocked; i++) {
      const a = stair.path[i - 1],
        b = stair.path[i];
      if (!a || !b) continue;
      const samples = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (profile.resolution / 2)),
      );
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        const point = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        };
        const obstacle = blockingCollider(compiled, point, 'openable', stair);
        if (obstacle) {
          blocked = obstacle.entityId;
          break;
        }
      }
    }
    if (blocked)
      issues.push({
        code: 'STAIR_HEADROOM',
        entityId: stair.id,
        message: `Stair route intersects ${blocked} or has insufficient headroom`,
      });
  }
  for (const stair of compiled.stairs)
    for (const landing of [stair.lower, stair.upper]) {
      const floor = compiled.building.floors.find((value) => value.id === landing.floorId);
      if (
        !floor ||
        !contains(floor.footprint, landing.position, profile.radius + profile.clearance) ||
        standingBlocked(compiled, landing.position)
      )
        issues.push({
          code: 'STAIR_ACCESS',
          entityId: stair.id,
          message: 'Stair landing is obstructed or too close to the floor boundary',
        });
    }
  return issues;
}
