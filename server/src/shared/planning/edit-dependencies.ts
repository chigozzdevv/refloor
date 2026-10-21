import { createEditGuards } from '@refloor/scene/edit-guards';
import { propertyKey, readProperty } from '@refloor/scene/properties';
import type { PropertyPath } from '@refloor/scene/properties';
import type { Building, SceneCommand } from '@refloor/scene';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import { siteSurfaceSlot } from '@refloor/scene/site-material';

const item = (id: string) => ({ key: 'id' as const, value: id });
function referencePaths(building: Building, id: string, spatial: boolean): PropertyPath[] {
  if (id === building.id) return [];
  if (siteSurfaceSlot(building, id)) return [['siteMaterials']];
  if (building.objects.some((object) => object.id === id)) {
    const root: PropertyPath = ['objects', item(id)];
    return spatial
      ? ['id', 'assetId', 'floorId', 'roomId', 'position', 'rotation', 'dimensions'].map((key) => [
          ...root,
          key,
        ])
      : [root];
  }
  if (id === building.roof.id) return [['roof']];
  for (const floor of building.floors) {
    const root: PropertyPath = ['floors', item(floor.id)];
    if (floor.rooms.some((room) => room.id === id)) return [[...root, 'rooms', item(id)]];
    for (const wall of floor.walls) {
      const wallRoot = [...root, 'walls', item(wall.id)];
      if (wall.id === id)
        return spatial
          ? ['start', 'end', 'thickness'].map((key) => [...wallRoot, key])
          : [wallRoot];
      if (wall.openings.some((opening) => opening.id === id))
        return [
          ...['start', 'end', 'thickness'].map((key) => [...wallRoot, key]),
          ...['id', 'offset', 'width', 'height'].map((key) => [
            ...wallRoot,
            'openings',
            item(id),
            key,
          ]),
        ];
    }
  }
  throw new Error('An item referenced by this instruction is unavailable.');
}

export function languageReadGuards(
  input: LanguageEditRequest,
  plan: LanguagePlan,
  commands: SceneCommand[],
) {
  const paths: PropertyPath[] = [];
  for (const id of plan.references ?? []) paths.push(...referencePaths(input.building, id, false));
  const actions = [
    ...plan.actions,
    ...plan.automations.flatMap((automation) => automation.actions),
  ];
  for (const action of actions) {
    const object = input.building.objects.find((object) => object.id === action.targetId);
    if (object)
      paths.push(['objects', item(object.id), 'id'], ['objects', item(object.id), 'assetId']);
    for (const id of [action.placement?.referenceId, action.placement?.facingId])
      if (id) paths.push(...referencePaths(input.building, id, true));
    if (
      action.action === 'cinema' ||
      (action.targetId === input.building.id &&
        ['power', 'intensity', 'reset-light'].includes(action.action))
    )
      paths.push(['objects']);
  }
  const guards = [
    ...(commands.length ? createEditGuards(input.building, commands) : []),
    ...paths.map((path) => ({ path, value: readProperty(input.building, path) })),
  ];
  return [...new Map(guards.map((guard) => [propertyKey(guard.path), guard])).values()];
}
