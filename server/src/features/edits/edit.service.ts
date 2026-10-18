import { validatePlacement } from '@refloor/engine';
import type { ProjectEdit, ProjectWrite } from '@refloor/contracts';
import type { RevisionRepository } from '@refloor/server/features/edits/revision.repo';
import { revisionKey } from '@refloor/server/features/edits/revision.model';
import { validateAssets } from '@refloor/server/features/houses/house.validation';

export class EditService {
  constructor(private readonly revisions: RevisionRepository) {}

  apply(ownerId: string, id: string, input: ProjectEdit): Promise<ProjectWrite> {
    return this.revisions.commit(ownerId, id, input.edit.id, 'edit', input, async (record) => {
      const result = validatePlacement(record.building, input.edit, {}, input.player ?? undefined);
      validateAssets(result.building);
      return {
        building: result.building,
        revision: result.revision,
        past: [...record.past, revisionKey(id, input.edit.id)].slice(-50),
        future: [],
      };
    });
  }
}
