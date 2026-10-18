import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';
import { editSchema } from '@refloor/scene/command';
import { SceneError } from '@refloor/scene/errors';
import { getObjectAsset } from '@refloor/scene/object';
import type { SceneObject } from '@refloor/scene/object';
import { fingerprintBuilding, revisionSchema } from '@refloor/scene/revision';
import type { EditResult } from '@refloor/scene/revision';
import { parseBuilding } from '@refloor/scene/schema';
import { conditionMatches, eventMatches, eventTargetExists } from '@refloor/scene/rules';
import type { SceneEvent } from '@refloor/scene/rules';

function objectFor(building: Building, id: string): SceneObject {
  const object = building.objects.find((value) => value.id === id);
  if (!object) throw new SceneError('NOT_FOUND', `Object does not exist: ${id}`);
  return object;
}

function execute(building: Building, command: SceneCommand): SceneCommand {
  switch (command.type) {
    case 'set-rules': {
      const inverse: SceneCommand = {
        type: 'set-rules',
        rules: building.rules ? structuredClone(building.rules) : null,
      };
      if (command.rules === null) delete building.rules;
      else building.rules = structuredClone(command.rules);
      return inverse;
    }
    case 'emit-event': {
      if (!eventTargetExists(building, command.event))
        throw new SceneError('INVALID_TARGET', 'This event has no matching item or capability');
      return command;
    }
    case 'add-object': {
      const ids = [
        building.id,
        building.roof.id,
        ...building.objects.map((value) => value.id),
        ...building.stairs.map((value) => value.id),
        ...building.floors.flatMap((floor) => [
          floor.id,
          ...floor.rooms.map((value) => value.id),
          ...floor.voids.map((value) => value.id),
          ...floor.walls.flatMap((wall) => [wall.id, ...wall.openings.map((value) => value.id)]),
        ]),
      ];
      if (ids.includes(command.object.id))
        throw new SceneError('INVALID_TARGET', `Entity ID already exists: ${command.object.id}`);
      const index = command.index ?? building.objects.length;
      if (index > building.objects.length)
        throw new SceneError('INVALID_TARGET', 'Insertion index exceeds the object count');
      building.objects.splice(index, 0, structuredClone(command.object));
      return { type: 'remove-object', objectId: command.object.id };
    }
    case 'remove-object': {
      const object = structuredClone(objectFor(building, command.objectId));
      const index = building.objects.findIndex((value) => value.id === object.id);
      building.objects.splice(index, 1);
      return { type: 'add-object', object, index };
    }
    case 'move-object': {
      const object = objectFor(building, command.objectId);
      const floor = building.floors.find((value) =>
        value.rooms.some((room) => room.id === command.roomId),
      );
      if (!floor) throw new SceneError('NOT_FOUND', `Room does not exist: ${command.roomId}`);
      const inverse: SceneCommand = {
        type: 'move-object',
        objectId: object.id,
        roomId: object.roomId,
        position: structuredClone(object.position),
        rotation: object.rotation,
      };
      object.floorId = floor.id;
      object.roomId = command.roomId;
      object.position = structuredClone(command.position);
      object.rotation = command.rotation;
      return inverse;
    }
    case 'rotate-object': {
      const object = objectFor(building, command.objectId);
      const inverse: SceneCommand = {
        type: 'rotate-object',
        objectId: object.id,
        rotation: object.rotation,
      };
      object.rotation = command.rotation;
      return inverse;
    }
    case 'resize-object': {
      const object = objectFor(building, command.objectId);
      const inverse: SceneCommand = {
        type: 'resize-object',
        objectId: object.id,
        dimensions: structuredClone(object.dimensions),
      };
      object.dimensions = structuredClone(command.dimensions);
      return inverse;
    }
    case 'replace-object': {
      const object = objectFor(building, command.objectId);
      const inverse: SceneCommand = {
        type: 'replace-object',
        objectId: object.id,
        asset: structuredClone(getObjectAsset(object)),
      };
      Object.assign(object, structuredClone(command.asset));
      return inverse;
    }
    case 'set-object-material': {
      const object = objectFor(building, command.objectId);
      const material = object.materials[command.slot];
      if (!Object.hasOwn(object.materials, command.slot) || !material)
        throw new SceneError('INVALID_TARGET', `Material slot does not exist: ${command.slot}`);
      const inverse: SceneCommand = {
        type: 'set-object-material',
        objectId: object.id,
        slot: command.slot,
        material: structuredClone(material),
      };
      object.materials[command.slot] = structuredClone(command.material);
      return inverse;
    }
    case 'set-wall-material': {
      const wall = building.floors
        .flatMap((floor) => floor.walls)
        .find((value) => value.id === command.wallId);
      if (!wall) throw new SceneError('NOT_FOUND', `Wall does not exist: ${command.wallId}`);
      const inverse: SceneCommand = {
        type: 'set-wall-material',
        wallId: wall.id,
        material: structuredClone(wall.material),
      };
      wall.material = structuredClone(command.material);
      return inverse;
    }
    case 'set-room-floor-material': {
      const room = building.floors
        .flatMap((floor) => floor.rooms)
        .find((value) => value.id === command.roomId);
      if (!room) throw new SceneError('NOT_FOUND', `Room does not exist: ${command.roomId}`);
      const inverse: SceneCommand = {
        type: 'set-room-floor-material',
        roomId: room.id,
        material: structuredClone(room.floorMaterial),
      };
      room.floorMaterial = structuredClone(command.material);
      return inverse;
    }
    case 'set-door': {
      const opening = building.floors
        .flatMap((floor) => floor.walls)
        .flatMap((wall) => wall.openings)
        .find((value) => value.id === command.doorId);
      if (!opening) throw new SceneError('NOT_FOUND', `Door does not exist: ${command.doorId}`);
      if (opening.kind !== 'door')
        throw new SceneError('UNSUPPORTED_ACTION', 'The selected opening is not a door');
      const inverse: SceneCommand = {
        type: 'set-door',
        doorId: opening.id,
        open: opening.state.open,
      };
      opening.state.open = command.open;
      return inverse;
    }
    case 'set-television': {
      const object = objectFor(building, command.objectId);
      const behaviour = object.behaviours.find((value) => value.kind === 'television');
      if (!behaviour)
        throw new SceneError('UNSUPPORTED_ACTION', 'This object has no television behaviour');
      const inverse: SceneCommand = {
        type: 'set-television',
        objectId: object.id,
        state: structuredClone(behaviour.state),
      };
      Object.assign(behaviour.state, command.state);
      return inverse;
    }
    case 'set-light': {
      const object = objectFor(building, command.objectId);
      const behaviour = object.behaviours.find((value) => value.kind === 'light');
      if (!behaviour)
        throw new SceneError('UNSUPPORTED_ACTION', 'This object has no light behaviour');
      const inverse: SceneCommand = {
        type: 'set-light',
        objectId: object.id,
        state: structuredClone(behaviour.state),
      };
      Object.assign(behaviour.state, command.state);
      return inverse;
    }
  }
}

export function applyCommands(
  input: unknown,
  request: unknown,
  options: { evaluateRules?: boolean } = {},
): EditResult {
  const original = parseBuilding(input);
  const edit = editSchema.parse(request);
  if (original.revision !== edit.expectedRevision)
    throw new SceneError(
      'REVISION_CONFLICT',
      `Expected revision ${edit.expectedRevision}, received ${original.revision}`,
    );
  const draft = structuredClone(original);
  const commands: SceneCommand[] = [...edit.commands],
    inverseCommands: SceneCommand[] = [];
  const fired = new Set<string>();
  for (let index = 0; index < commands.length; index++) {
    if (commands.length > 100)
      throw new SceneError(
        'UNSUPPORTED_ACTION',
        'Saved actions exceed the limit of 100 changes in one interaction',
      );
    const command = commands[index]!,
      inverse = execute(draft, command);
    inverseCommands.unshift(inverse);
    if (options.evaluateRules === false) continue;
    if (command.type === 'remove-object' && draft.rules) {
      const affected = (event: SceneEvent) =>
        'objectId' in event && event.objectId === command.objectId;
      const remaining = draft.rules.filter(
        (rule) =>
          !affected(rule.trigger) &&
          !rule.conditions.some(affected) &&
          !rule.actions.some(
            (action) => 'objectId' in action && action.objectId === command.objectId,
          ),
      );
      if (remaining.length !== draft.rules.length)
        commands.splice(index + 1, 0, { type: 'set-rules', rules: remaining });
    }
    let event: SceneEvent | undefined;
    if (command.type === 'emit-event') event = command.event;
    else if (
      command.type === 'set-door' &&
      inverse.type === 'set-door' &&
      inverse.open !== command.open
    )
      event = { kind: 'door', doorId: command.doorId, open: command.open };
    else if (
      (command.type === 'set-light' || command.type === 'set-television') &&
      (inverse.type === 'set-light' || inverse.type === 'set-television') &&
      command.state.powered !== undefined &&
      command.state.powered !== inverse.state.powered
    )
      event = { kind: 'power', objectId: command.objectId, powered: command.state.powered };
    if (!event) continue;
    const effects = (draft.rules ?? []).flatMap((rule) => {
      if (
        !rule.enabled ||
        fired.has(rule.id) ||
        !eventMatches(rule.trigger, event!) ||
        !rule.conditions.every((condition) => conditionMatches(draft, condition))
      )
        return [];
      fired.add(rule.id);
      return rule.actions;
    });
    commands.splice(index + 1, 0, ...effects);
  }
  draft.revision += 1;
  const building = parseBuilding(draft);
  const revision = revisionSchema.parse({
    id: edit.id,
    at: edit.at,
    sceneId: building.id,
    parentRevision: original.revision,
    revision: building.revision,
    beforeFingerprint: fingerprintBuilding(original),
    afterFingerprint: fingerprintBuilding(building),
    commands,
    inverseCommands,
  });
  return { building, revision };
}
