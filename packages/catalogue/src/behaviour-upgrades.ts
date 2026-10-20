import type { Building, SceneCommand } from '@refloor/scene';
import { getCatalogueEntry } from '@refloor/catalogue/furniture';

export function catalogueBehaviourUpgrades(building: Building): SceneCommand[] {
  return building.objects.flatMap((object): SceneCommand[] => {
    const entry = getCatalogueEntry(object.assetId);
    const missing = entry.behaviours.filter(
      (behaviour) =>
        entry.optionalBehaviours?.includes(behaviour.kind) &&
        !object.behaviours.some((existing) => existing.kind === behaviour.kind),
    );
    return missing.length
      ? [
          {
            type: 'add-object-behaviours',
            objectId: object.id,
            behaviours: structuredClone(missing),
          },
        ]
      : [];
  });
}
