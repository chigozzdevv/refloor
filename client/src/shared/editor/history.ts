import type { Building, SceneCommand, SceneRevision } from '@refloor/scene';
import { targetIdentity } from '@/shared/editor/identity';

export function describeTarget(building: Building, commands: SceneCommand[]) {
  const targets = commands.map((command) => {
    if (command.type === 'set-rules' || command.type === 'emit-event')
      return { kind: 'house' as const, id: building.id };
    if ('objectId' in command) return { kind: 'object' as const, id: command.objectId };
    if ('wallId' in command) return { kind: 'wall' as const, id: command.wallId };
    if ('roomId' in command) return { kind: 'floor' as const, id: command.roomId };
    if ('doorId' in command) return { kind: 'door' as const, id: command.doorId };
    return { kind: 'object' as const, id: command.object.id };
  });
  const first = targets[0];
  if (!first || targets.some((target) => target.id !== first.id || target.kind !== first.kind))
    return undefined;
  const identity = targetIdentity(building, first);
  return identity ? `${identity.label} · ${identity.location}` : undefined;
}

export type EditDetails = {
  label?: string;
  target?: string | undefined;
  source?: 'chat' | 'manual' | 'navigation';
};
export type HistoryRecord = {
  revision: SceneRevision;
  label: string;
  source: 'chat' | 'manual' | 'navigation';
  target?: string | undefined;
};

export function describeChange(building: Building, commands: SceneCommand[]) {
  const command = commands[0];
  if (!command) return 'Edit space';
  const object =
    'objectId' in command ? building.objects.find((value) => value.id === command.objectId) : null;
  let label: string;
  switch (command.type) {
    case 'set-rules':
      label = 'Update saved actions';
      break;
    case 'emit-event':
      label = 'Run saved actions';
      break;
    case 'add-object':
      label = `Add ${command.object.label}`;
      break;
    case 'remove-object':
      label = `Remove ${object?.label ?? 'item'}`;
      break;
    case 'move-object':
      label = `Move ${object?.label ?? 'item'}`;
      break;
    case 'rotate-object':
      label = `Rotate ${object?.label ?? 'item'}`;
      break;
    case 'resize-object':
      label = `Resize ${object?.label ?? 'item'}`;
      break;
    case 'replace-object':
      label = `Replace ${object?.label ?? 'item'}`;
      break;
    case 'set-object-material':
      label = `Change ${object?.label ?? 'item'} finish`;
      break;
    case 'set-wall-material':
      label = 'Change wall finish';
      break;
    case 'set-room-floor-material':
      label = 'Change floor finish';
      break;
    case 'set-door':
      label = `${command.open ? 'Open' : 'Close'} door`;
      break;
    case 'set-light':
      label = `Update ${object?.label ?? 'light'}`;
      break;
    case 'set-television':
      label = `Update ${object?.label ?? 'television'}`;
      break;
  }
  return commands.length > 1 ? `${label} · ${commands.length} changes` : label;
}
