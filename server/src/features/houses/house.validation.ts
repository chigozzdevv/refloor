import { validateBuildingAssets, validateCommandTuning } from '@refloor/catalogue';
import type { Building, SceneCommand } from '@refloor/scene';
import { ApiError } from '@refloor/server/shared/http/errors';
import { createEditMemory } from '@refloor/scene/edit-memory';
import type { EditMemory } from '@refloor/scene/edit-memory';

export function validateMemory(building: Building, memory?: EditMemory): EditMemory {
  if (memory && memory.sceneId !== building.id)
    throw new ApiError(422, 'CONTEXT_MISMATCH', 'Edit context belongs to another house.');
  const context = memory ?? createEditMemory(building);
  if (context.originals.some((item) => item.kind === 'roof' && item.id === building.roof.id))
    return context;
  return {
    ...context,
    originals: [
      ...context.originals,
      { kind: 'roof', id: building.roof.id, value: structuredClone(building.roof) },
    ],
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
