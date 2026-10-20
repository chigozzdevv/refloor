import { boxesOverlap } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import type { CompiledBuilding, EngineIssue } from '@refloor/engine/types';

export function checkOpenableClearance(compiled: CompiledBuilding): EngineIssue[] {
  const issues: EngineIssue[] = [];
  for (const panel of compiled.colliders) {
    if (!panel.id.endsWith(':openable-clearance')) continue;
    for (const obstacle of compiled.colliders) {
      if (
        obstacle.entityId === panel.entityId ||
        obstacle.role === 'slab' ||
        obstacle.role === 'roof'
      )
        continue;
      if (boxesOverlap(colliderBounds(panel), colliderBounds(obstacle)))
        issues.push({
          code: 'OPENABLE_CLEARANCE',
          entityId: panel.entityId,
          message: `Opening needs space in front of this item; blocked by ${obstacle.entityId}`,
        });
    }
  }
  return issues;
}
