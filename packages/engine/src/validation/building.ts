import { compileBuilding } from '@refloor/engine/compile';
import { EngineError } from '@refloor/engine/errors';
import { buildNavigation } from '@refloor/engine/navigation/connectivity';
import { checkReachability } from '@refloor/engine/navigation/reachability';
import { checkClearance } from '@refloor/engine/validation/clearance';
import { checkEnclosure } from '@refloor/engine/validation/enclosure';
import type { CompiledBuilding, EngineOptions } from '@refloor/engine/types';

export function validateBuilding(
  input: unknown,
  options: Partial<EngineOptions> = {},
): CompiledBuilding {
  const compiled = compileBuilding(input, options);
  const issues = [...checkEnclosure(compiled), ...checkClearance(compiled)];
  issues.push(...checkReachability(buildNavigation(compiled)));
  if (issues.length) throw new EngineError(issues);
  return compiled;
}
