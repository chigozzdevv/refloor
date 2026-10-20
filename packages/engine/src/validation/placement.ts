import { applyCommands, parseBuilding } from '@refloor/scene';
import type { EditResult } from '@refloor/scene';
import { validateBuilding } from '@refloor/engine/validation/building';
import type { CompiledBuilding, EngineOptions, NavigationPoint } from '@refloor/engine/types';
import { isPlayerPositionValid } from '@refloor/engine/validation/player';
import { fail } from '@refloor/engine/errors';
import { checkStructuralAttachments } from '@refloor/engine/validation/structural';

export function validatePlacement(
  input: unknown,
  edit: unknown,
  options: Partial<EngineOptions> = {},
  player?: NavigationPoint,
): EditResult & { compiled: CompiledBuilding } {
  const result = applyCommands(input, edit);
  const compiled = validateBuilding(result.building, options);
  if (result.revision.commands.some((command) => command.type === 'move-partition'))
    checkStructuralAttachments(parseBuilding(input), result.building, result.revision.commands);
  if (player && !isPlayerPositionValid(compiled, player))
    fail(
      'PLAYER_BLOCKED',
      player.floorId,
      'Edit would occupy the player or remove their floor support',
    );
  return { ...result, compiled };
}
