import { finishes } from '@refloor/catalogue';
import { exteriorAdditions } from '@refloor/catalogue/houses/exterior';
import type { Building, SceneCommand } from '@refloor/scene';
import type { EditMemory } from '@refloor/scene/edit-memory';
import { sameMaterial } from '@/shared/scene/finish';

export function exteriorUpgradeCommands(building: Building, memory: EditMemory): SceneCommand[] {
  const known = new Set(
    memory.originals.filter((item) => item.kind === 'object').map((item) => item.id),
  );
  const additions = exteriorAdditions(building).filter((object) => !known.has(object.id));
  const alreadyUpgraded = [
    'site/wall-light-left',
    'site/wall-light-right',
    'site/planter-left',
    'site/planter-right',
  ].some((id) => known.has(id));
  const changedRoof = memory.transitions.some((transition) =>
    transition.revision.commands.some(
      (command) => command.type === 'set-roof-material' && command.roofId === building.roof.id,
    ),
  );
  const commands: SceneCommand[] = additions.map((object) => ({ type: 'add-object', object }));
  if (!alreadyUpgraded && !changedRoof && sameMaterial(building.roof.material, finishes.chalk))
    commands.push({
      type: 'set-roof-material',
      roofId: building.roof.id,
      material: structuredClone(
        building.roof.kind === 'gable' ? finishes.metalRoof : finishes.asphalt,
      ),
    });
  return commands;
}
