import { compileBuilding } from '@refloor/engine/compile';
import { EngineError } from '@refloor/engine/errors';
import { buildNavigation } from '@refloor/engine/navigation/connectivity';
import { checkReachability } from '@refloor/engine/navigation/reachability';
import { checkClearance } from '@refloor/engine/validation/clearance';
import { checkEnclosure } from '@refloor/engine/validation/enclosure';
import type { CompiledBuilding, EngineOptions } from '@refloor/engine/types';
import { geometryKey } from '@refloor/engine/validation/geometry-key';
import { checkDoorClearance } from '@refloor/engine/validation/door-clearance';

const validatedGeometry = new Set<string>();

export function validateBuilding(
  input: unknown,
  options: Partial<EngineOptions> = {},
): CompiledBuilding {
  const compiled = compileBuilding(input, options);
  const key = geometryKey(compiled);
  if (validatedGeometry.has(key)) {
    // Static access stays valid; moving door leaves still need fresh clearance checks.
    const doorIssues = checkDoorClearance(compiled);
    if (doorIssues.length) throw new EngineError(doorIssues);
    return compiled;
  }
  const issues = [...checkEnclosure(compiled), ...checkClearance(compiled)];
  issues.push(...checkReachability(buildNavigation(compiled)));
  if (issues.length) throw new EngineError(issues);
  validatedGeometry.add(key);
  if (validatedGeometry.size > 8)
    validatedGeometry.delete(validatedGeometry.values().next().value!);
  return compiled;
}
