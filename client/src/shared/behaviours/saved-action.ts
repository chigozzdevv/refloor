import { conditionMatches } from '@refloor/scene';
import type { Building } from '@refloor/scene';

export function savedActionCommands(building: Building, id: string) {
  const rule = building.rules?.find((value) => value.id === id);
  if (!rule) throw new Error('This saved action is no longer available.');
  if (!rule.enabled) throw new Error('Enable this saved action before testing it.');
  if (!rule.conditions.every((condition) => conditionMatches(building, condition)))
    throw new Error('The conditions for this saved action are not met yet.');
  return structuredClone(rule.actions);
}
