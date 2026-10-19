import { EngineError, isPlayerPositionValid, validateBuilding } from '@refloor/engine';
import { undoRevision } from '@refloor/scene';
import type { ProjectHistory, ProjectWrite } from '@refloor/scene/contracts';
import type { RevisionRepository } from '@refloor/server/features/edits/revision.repo';
import { revisionKey } from '@refloor/server/features/edits/revision.model';
import { validateAssets, validateMemory } from '@refloor/server/features/houses/house.validation';
import { ApiError } from '@refloor/server/shared/http/errors';
import { recordTransition } from '@refloor/scene/edit-memory';

export class UndoService {
  constructor(private readonly revisions: RevisionRepository) {}

  restore(
    ownerId: string,
    id: string,
    kind: 'undo' | 'redo',
    input: ProjectHistory,
  ): Promise<ProjectWrite> {
    return this.revisions.commit(ownerId, id, input.id, kind, input, async (record, history) => {
      if (record.building.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'This project has changed. Open the latest version or save your work as a new project.',
        );
      const stack = kind === 'undo' ? record.past : record.future,
        key = stack.at(-1);
      if (!key) throw new ApiError(409, 'HISTORY_EMPTY', `There is no change to ${kind}.`);
      const previous = await history.find(key);
      if (!previous?.revision) throw new Error('Project history is incomplete');
      const result = undoRevision(record.building, previous.revision, {
        id: input.id,
        at: input.at,
      });
      const compiled = validateBuilding(result.building);
      if (input.player && !isPlayerPositionValid(compiled, input.player))
        throw new EngineError([
          {
            code: 'PLAYER_BLOCKED',
            entityId: input.player.floorId,
            message: 'This change would occupy the player or remove their floor support.',
          },
        ]);
      validateAssets(result.building);
      const nextId = revisionKey(id, input.id);
      return {
        building: result.building,
        memory: recordTransition(validateMemory(record.building, record.memory), result.building, {
          revision: result.revision,
          kind,
          source: 'manual',
          label: `${kind === 'undo' ? 'Undo' : 'Redo'} change`,
        }),
        revision: result.revision,
        past: kind === 'undo' ? record.past.slice(0, -1) : [...record.past, nextId].slice(-50),
        future:
          kind === 'redo' ? record.future.slice(0, -1) : [...record.future, nextId].slice(-50),
      };
    });
  }
}
