import { applyCommands } from '@refloor/scene';
import type { EditResult } from '@refloor/scene';
import { validateBuilding } from '@refloor/engine/validation/building';
import type { CompiledBuilding, EngineOptions, NavigationPoint } from '@refloor/engine/types';
import { isPlayerPositionValid } from '@refloor/engine/validation/player';
import { fail } from '@refloor/engine/errors';

export function validatePlacement(
  input: unknown,
  edit: unknown,
  options: Partial<EngineOptions> = {},
  player?: NavigationPoint,
): EditResult & { compiled: CompiledBuilding } {
  const result = applyCommands(input, edit);
  const compiled = validateBuilding(result.building, options);
  if (player && !isPlayerPositionValid(compiled, player))
    fail(
      'PLAYER_BLOCKED',
      player.floorId,
      'Edit would occupy the player or remove their floor support',
    );
  return { ...result, compiled };
}
