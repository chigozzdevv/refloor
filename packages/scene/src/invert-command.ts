import { applyCommands } from '@refloor/scene/apply-command';
import { editMetadataSchema } from '@refloor/scene/command';
import { SceneError } from '@refloor/scene/errors';
import { fingerprintBuilding, revisionSchema } from '@refloor/scene/revision';
import type { EditResult } from '@refloor/scene/revision';
import { parseBuilding } from '@refloor/scene/schema';

export function undoRevision(input: unknown, record: unknown, metadata: unknown): EditResult {
  const building = parseBuilding(input);
  const revision = revisionSchema.parse(record);
  const edit = editMetadataSchema.parse(metadata);
  if (
    building.id !== revision.sceneId ||
    building.revision < revision.revision ||
    fingerprintBuilding(building) !== revision.afterFingerprint
  ) {
    throw new SceneError('REVISION_MISMATCH', 'The revision does not match the current building');
  }
  const undone = applyCommands(
    building,
    {
      ...edit,
      expectedRevision: building.revision,
      commands: revision.inverseCommands,
    },
    { evaluateRules: false },
  );
  const restored = { ...undone.building, revision: revision.parentRevision };
  if (fingerprintBuilding(restored) !== revision.beforeFingerprint)
    throw new SceneError(
      'REVISION_MISMATCH',
      'Inverse commands do not restore the recorded building',
    );
  const replay = applyCommands(
    restored,
    {
      ...edit,
      expectedRevision: restored.revision,
      commands: revision.commands,
    },
    { evaluateRules: false },
  );
  if (fingerprintBuilding(replay.building) !== revision.afterFingerprint)
    throw new SceneError('REVISION_MISMATCH', 'Recorded commands do not reproduce the building');
  return undone;
}
