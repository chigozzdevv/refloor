import type { Building, ObjectAsset, SceneCommand } from '@refloor/scene';
import { getCatalogueEntry } from '@refloor/catalogue/furniture';

export function lightTuning(object: Pick<ObjectAsset, 'assetId'>) {
  const light = getCatalogueEntry(object.assetId).behaviours.find((item) => item.kind === 'light');
  if (!light) return null;
  return {
    min: 0,
    normal: light.state.intensity,
    max: light.state.intensity * 2,
    defaults: { ...light.state },
  };
}

export function lightOutput(object: ObjectAsset) {
  const tuning = lightTuning(object),
    state = object.behaviours.find((item) => item.kind === 'light')?.state;
  if (!tuning || !state?.powered) return 0;
  return Math.max(tuning.min, Math.min(tuning.max, state.intensity));
}

export function validateCommandTuning(building: Building, commands: SceneCommand[]) {
  const objects = new Map<string, ObjectAsset>(
    building.objects.map((object) => [object.id, object]),
  );
  const check = (object: ObjectAsset, intensity: number | undefined) => {
    const tuning = lightTuning(object);
    if (
      tuning &&
      intensity !== undefined &&
      (!Number.isFinite(intensity) || intensity < tuning.min || intensity > tuning.max)
    )
      throw new Error(`${object.label} brightness must be between 0% and 200%. Normal is 100%.`);
  };
  for (const command of commands) {
    if (command.type === 'add-object' || command.type === 'replace-object') {
      const object = command.type === 'add-object' ? command.object : command.asset;
      check(object, object.behaviours.find((item) => item.kind === 'light')?.state.intensity);
      objects.set(command.type === 'add-object' ? command.object.id : command.objectId, object);
    } else if (command.type === 'remove-object') objects.delete(command.objectId);
    else if (command.type === 'set-light') {
      const object = objects.get(command.objectId);
      if (object) check(object, command.state.intensity);
    }
  }
}
