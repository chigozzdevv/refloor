import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';
import { SceneError } from '@refloor/scene/errors';

export type ResolvedCommand = Exclude<
  SceneCommand,
  {
    type:
      'translate-object' | 'turn-object' | 'adjust-light-intensity' | 'adjust-television-volume';
  }
>;

export function resolveRelativeCommand(building: Building, command: SceneCommand): ResolvedCommand {
  if (
    command.type !== 'translate-object' &&
    command.type !== 'turn-object' &&
    command.type !== 'adjust-light-intensity' &&
    command.type !== 'adjust-television-volume'
  )
    return command;
  const object = building.objects.find((item) => item.id === command.objectId);
  if (!object) throw new SceneError('NOT_FOUND', `Object does not exist: ${command.objectId}`);
  if (command.type === 'turn-object')
    return {
      type: 'rotate-object',
      objectId: object.id,
      rotation: object.rotation + command.radians,
    };
  if (command.type === 'translate-object') {
    const position = {
      x: object.position.x + command.delta.x,
      y: object.position.y + command.delta.y,
      z: object.position.z + command.delta.z,
    };
    const floor = building.floors.find((item) => item.id === object.floorId);
    const room = floor?.rooms.find(
      (item) =>
        position.x >= item.footprint.x &&
        position.x <= item.footprint.x + item.footprint.width &&
        position.z >= item.footprint.z &&
        position.z <= item.footprint.z + item.footprint.depth,
    );
    return {
      type: 'move-object',
      objectId: object.id,
      roomId: room?.id ?? object.roomId,
      position,
      rotation: object.rotation,
    };
  }
  if (command.type === 'adjust-light-intensity') {
    const light = object.behaviours.find((item) => item.kind === 'light');
    if (!light) throw new SceneError('UNSUPPORTED_ACTION', 'This object has no light behaviour');
    return {
      type: 'set-light',
      objectId: object.id,
      state: {
        intensity: Math.max(
          command.limits.min,
          Math.min(command.limits.max, light.state.intensity + command.delta),
        ),
      },
    };
  }
  const television = object.behaviours.find((item) => item.kind === 'television');
  if (!television)
    throw new SceneError('UNSUPPORTED_ACTION', 'This object has no television behaviour');
  return {
    type: 'set-television',
    objectId: object.id,
    state: { volume: Math.max(0, Math.min(1, television.state.volume + command.delta)) },
  };
}
