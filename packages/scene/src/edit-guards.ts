import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';
import { applyCommands } from '@refloor/scene/apply-command';
import { diffProperties, propertyKey, readProperty } from '@refloor/scene/properties';
import type { PropertyGuard, PropertyPath } from '@refloor/scene/properties';

const item = (id: string) => ({ key: 'id' as const, value: id });
function commandPaths(building: Building, command: SceneCommand): PropertyPath[] {
  if (command.type === 'restore-properties') return command.changes.map((change) => change.path);
  if (command.type === 'set-rules' || command.type === 'emit-event') return [['rules']];
  if (command.type === 'add-object') return [['objects', item(command.object.id)]];
  if ('objectId' in command) {
    const root: PropertyPath = ['objects', item(command.objectId)];
    switch (command.type) {
      case 'move-object':
      case 'translate-object':
        return [
          ...['position', 'roomId', 'floorId', 'rotation'].map((key) => [...root, key]),
          [...root, 'assetId'],
        ];
      case 'rotate-object':
      case 'turn-object':
        return [[...root, 'rotation']];
      case 'resize-object':
        return [[...root, 'dimensions']];
      case 'set-object-material':
        return [[...root, 'materials', command.slot]];
      case 'set-light':
      case 'set-television':
      case 'set-cooker':
      case 'set-water':
      case 'set-openable':
        return Object.keys(command.state).map((key) => [
          ...root,
          'behaviours',
          { key: 'kind', value: command.type.slice(4) },
          'state',
          key,
        ]);
      default:
        return [root];
    }
  }
  if ('roofId' in command) return [['roof', 'material']];
  if ('surfaceId' in command) return [['siteMaterials']];
  if ('roomId' in command) {
    const floor = building.floors.find((floor) =>
      floor.rooms.some((room) => room.id === command.roomId),
    );
    return floor
      ? [['floors', item(floor.id), 'rooms', item(command.roomId), 'floorMaterial']]
      : [['floors']];
  }
  if ('wallId' in command) {
    const floor = building.floors.find((floor) =>
      floor.walls.some((wall) => wall.id === command.wallId),
    );
    if (!floor || command.type === 'move-partition') return [['floors'], ['stairs']];
    const root: PropertyPath = ['floors', item(floor.id), 'walls', item(command.wallId)];
    if (command.type === 'set-opening') return [[...root, 'openings', item(command.openingId)]];
    return [
      [...root, command.type === 'set-wall-exterior-material' ? 'exteriorMaterial' : 'material'],
      ...(command.type === 'set-wall-material' ? [[...root, 'exteriorMaterial']] : []),
    ];
  }
  if ('doorId' in command) {
    for (const floor of building.floors)
      for (const wall of floor.walls)
        for (const opening of wall.openings)
          if (opening.kind === 'door' && opening.id === command.doorId)
            return [
              [
                'floors',
                item(floor.id),
                'walls',
                item(wall.id),
                'openings',
                item(opening.id),
                'state',
                'open',
              ],
            ];
    return [['floors']];
  }
  return [];
}
export function editGuardPaths(building: Building, commands: SceneCommand[]): PropertyPath[] {
  const result = applyCommands(building, {
    id: 'guard',
    at: new Date(0).toISOString(),
    expectedRevision: building.revision,
    commands,
  });
  const paths = [...commands, ...result.revision.commands].flatMap((command) =>
    commandPaths(building, command),
  );
  paths.push(...diffProperties(building, result.building).map((patch) => patch.path), ['rules']);
  return [...new Map(paths.map((path) => [propertyKey(path), path])).values()];
}
export function createEditGuards(building: Building, commands: SceneCommand[]): PropertyGuard[] {
  return editGuardPaths(building, commands).map((path) => ({
    path,
    value: readProperty(building, path),
  }));
}
export function guardsCover(paths: PropertyPath[], guards: PropertyGuard[]) {
  return paths.every((path) =>
    guards.some(
      (guard) =>
        guard.path.length <= path.length &&
        propertyKey(guard.path) === propertyKey(path.slice(0, guard.path.length)),
    ),
  );
}
