import type { Building, SceneCommand, SceneRevision } from '@refloor/scene';

export type EditDetails = { label?: string; source?: 'chat' | 'manual' | 'navigation' };
export type HistoryRecord = {
  revision: SceneRevision;
  label: string;
  source: 'chat' | 'manual' | 'navigation';
};

export function describeChange(building: Building, commands: SceneCommand[]) {
  const command = commands[0];
  if (!command) return 'Edit space';
  const object =
    'objectId' in command ? building.objects.find((value) => value.id === command.objectId) : null;
  let label: string;
  switch (command.type) {
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
