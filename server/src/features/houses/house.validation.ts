import { validateBuildingAssets, validateCommandTuning } from '@refloor/catalogue';
import type { Building, SceneCommand } from '@refloor/scene';
import { ApiError } from '@refloor/server/shared/http/errors';
import { captureElements, createEditMemory } from '@refloor/scene/edit-memory';
import type { EditMemory } from '@refloor/scene/edit-memory';

export function validateMemory(building: Building, memory?: EditMemory): EditMemory {
  if (memory && memory.sceneId !== building.id)
    throw new ApiError(422, 'CONTEXT_MISMATCH', 'Edit context belongs to another house.');
  const context = memory ?? createEditMemory(building);
  const known = new Set(context.originals.map((item) => `${item.kind}:${item.id}`)),
    missing = captureElements(building).filter(
      (item) =>
        (item.kind === 'roof' || item.kind === 'surface') && !known.has(`${item.kind}:${item.id}`),
    );
  if (!missing.length) return context;
  return {
    ...context,
    originals: [...context.originals, ...missing],
  };
}

export function validateTuning(building: Building, commands: SceneCommand[]) {
  try {
    validateCommandTuning(building, commands);
  } catch (error) {
    throw new ApiError(
      422,
      'TUNING_LIMIT',
      error instanceof Error ? error.message : 'This setting exceeds its limit.',
    );
  }
}

export function validateAssets(building: Building) {
  try {
    validateBuildingAssets(building);
  } catch (error) {
    throw new ApiError(
      422,
      'UNSUPPORTED_ASSET',
      error instanceof Error ? error.message : 'This project uses an unavailable asset.',
    );
  }
}
