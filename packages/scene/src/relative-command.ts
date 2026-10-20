import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';
import { SceneError } from '@refloor/scene/errors';
import { cookerIgnitionHeat, waterStartFlow } from '@refloor/scene/behaviour';

export type ResolvedCommand = Exclude<
  SceneCommand,
  {
    type:
      | 'translate-object'
      | 'turn-object'
      | 'adjust-light-intensity'
      | 'adjust-television-volume'
      | 'adjust-cooker-heat'
      | 'set-cooker-burner'
      | 'ignite-cooker'
      | 'start-water'
      | 'adjust-water-flow'
      | 'adjust-water-temperature';
  }
>;

export function resolveRelativeCommand(building: Building, command: SceneCommand): ResolvedCommand {
  if (
    command.type !== 'translate-object' &&
    command.type !== 'turn-object' &&
    command.type !== 'adjust-light-intensity' &&
    command.type !== 'adjust-television-volume' &&
    command.type !== 'adjust-cooker-heat' &&
    command.type !== 'set-cooker-burner' &&
    command.type !== 'ignite-cooker' &&
    command.type !== 'start-water' &&
    command.type !== 'adjust-water-flow' &&
    command.type !== 'adjust-water-temperature'
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
  if (
    command.type === 'adjust-cooker-heat' ||
    command.type === 'set-cooker-burner' ||
    command.type === 'ignite-cooker'
  ) {
    const cooker = object.behaviours.find((item) => item.kind === 'cooker');
    if (!cooker) throw new SceneError('UNSUPPORTED_ACTION', 'This object has no cooker behaviour');
    if (command.type === 'ignite-cooker')
      return {
        type: 'set-cooker',
        objectId: object.id,
        state: {
          powered: true,
          heat: cooker.state.heat > 0 ? cooker.state.heat : cookerIgnitionHeat,
          burners: cooker.state.burners.some(Boolean)
            ? [...cooker.state.burners]
            : [true, false, false, false],
        },
      };
    if (command.type === 'set-cooker-burner') {
      const burners: typeof cooker.state.burners =
        command.enabled && !cooker.state.powered
          ? [false, false, false, false]
          : [...cooker.state.burners];
      burners[command.burner] = command.enabled;
      return {
        type: 'set-cooker',
        objectId: object.id,
        state: {
          burners,
          powered: command.enabled || (cooker.state.powered && burners.some(Boolean)),
          ...(command.enabled && cooker.state.heat === 0 ? { heat: cookerIgnitionHeat } : {}),
        },
      };
    }
    return {
      type: 'set-cooker',
      objectId: object.id,
      state: { heat: Math.max(0, Math.min(1, cooker.state.heat + command.delta)) },
    };
  }
  if (
    command.type === 'adjust-water-flow' ||
    command.type === 'adjust-water-temperature' ||
    command.type === 'start-water'
  ) {
    const water = object.behaviours.find((item) => item.kind === 'water');
    if (!water) throw new SceneError('UNSUPPORTED_ACTION', 'This object has no water behaviour');
    if (command.type === 'start-water')
      return {
        type: 'set-water',
        objectId: object.id,
        state: { powered: true, flow: water.state.flow > 0 ? water.state.flow : waterStartFlow },
      };
    return {
      type: 'set-water',
      objectId: object.id,
      state:
        command.type === 'adjust-water-flow'
          ? { flow: Math.max(0, Math.min(1, water.state.flow + command.delta)) }
          : { temperature: Math.max(10, Math.min(60, water.state.temperature + command.delta)) },
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
