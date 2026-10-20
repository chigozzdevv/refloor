import type { Building, SceneCommand, SceneRevision } from '@refloor/scene';
import { targetIdentity } from '@/shared/editor/identity';

export function describeTarget(building: Building, commands: SceneCommand[]) {
  const targets = commands.map((command) => {
    if (command.type === 'set-rules' || command.type === 'emit-event')
      return { kind: 'house' as const, id: building.id };
    if ('objectId' in command) return { kind: 'object' as const, id: command.objectId };
    if ('roofId' in command) return { kind: 'roof' as const, id: command.roofId };
    if ('surfaceId' in command) return { kind: 'surface' as const, id: command.surfaceId };
    if ('wallId' in command)
      return {
        kind: 'wall' as const,
        id: command.wallId,
        ...(command.type === 'set-wall-exterior-material' ? { side: 'exterior' as const } : {}),
      };
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
  undoable?: boolean | undefined;
};

export function isUndoable(record: HistoryRecord) {
  return (
    record.source !== 'navigation' ||
    record.undoable === true ||
    (record.undoable === undefined &&
      record.revision.beforeFingerprint !== record.revision.afterFingerprint &&
      record.revision.commands.some(
        (command) => command.type !== 'set-door' && command.type !== 'emit-event',
      ))
  );
}

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
    case 'translate-object':
      label = `Move ${object?.label ?? 'item'}`;
      break;
    case 'rotate-object':
    case 'turn-object':
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
    case 'set-wall-exterior-material':
      label = 'Change exterior wall finish';
      break;
    case 'set-roof-material':
      label = 'Change roof finish';
      break;
    case 'set-site-material':
      label = 'Change exterior finish';
      break;
    case 'set-room-floor-material':
      label = 'Change floor finish';
      break;
    case 'set-door':
      label = `${command.open ? 'Open' : 'Close'} door`;
      break;
    case 'set-opening':
      label = 'Change door or window dimensions';
      break;
    case 'move-partition':
      label = 'Move shared room partition';
      break;
    case 'set-light':
    case 'adjust-light-intensity':
      label = `Update ${object?.label ?? 'light'}`;
      break;
    case 'set-television':
    case 'adjust-television-volume':
      label = `Update ${object?.label ?? 'television'}`;
      break;
    case 'set-cooker':
    case 'ignite-cooker':
    case 'set-cooker-burner':
    case 'adjust-cooker-heat':
      label = `Adjust ${object?.label ?? 'cooker'} burners`;
      break;
    case 'set-water':
    case 'start-water':
    case 'adjust-water-flow':
    case 'adjust-water-temperature':
      label = `Adjust ${object?.label ?? 'water fixture'}`;
      break;
    case 'set-openable':
      label = `${command.state.open ? 'Open' : 'Close'} ${object?.label ?? 'storage'}`;
      break;
    case 'add-object-behaviours':
    case 'remove-object-behaviours':
      label = `Update ${object?.label ?? 'item'} interactions`;
      break;
  }
  return commands.length > 1 ? `${label} · ${commands.length} changes` : label;
}
