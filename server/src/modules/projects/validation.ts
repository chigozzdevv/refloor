import { validateBuildingAssets } from '@refloor/catalogue';
import type { Building } from '@refloor/scene';
import { ApiError } from '@refloor/server/http/errors';

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
