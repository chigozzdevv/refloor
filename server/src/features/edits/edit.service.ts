import { ApiError } from '@refloor/server/shared/http/errors';
import { validatePlacement } from '@refloor/engine';
import type { ProjectEdit, ProjectWrite } from '@refloor/scene/contracts';
import type { RevisionRepository } from '@refloor/server/features/edits/revision.repo';
import { revisionKey } from '@refloor/server/features/edits/revision.model';
import {
  validateAssets,
  validateTuning,
  validateMemory,
} from '@refloor/server/features/houses/house.validation';
import { recordTransition } from '@refloor/scene/edit-memory';

export class EditService {
  constructor(private readonly revisions: RevisionRepository) {}

  apply(ownerId: string, id: string, input: ProjectEdit): Promise<ProjectWrite> {
    return this.revisions.commit(ownerId, id, input.edit.id, 'edit', input, async (record) => {
      if (input.edit.commands.some((command) => command.type === 'restore-properties'))
        throw new ApiError(400, 'INVALID_COMMAND', 'Use history to restore a change.');
      validateTuning(record.building, input.edit.commands);
      const result = validatePlacement(record.building, input.edit, {}, input.player ?? undefined);
      validateTuning(record.building, result.revision.commands);
      validateAssets(result.building);
      return {
        building: result.building,
        memory: recordTransition(validateMemory(record.building, record.memory), result.building, {
          revision: result.revision,
          kind: 'edit',
          source: 'manual',
          label: 'Edit space',
        }),
        revision: result.revision,
        past: [...record.past, revisionKey(id, input.edit.id)].slice(-50),
        future: [],
      };
    });
  }
}
