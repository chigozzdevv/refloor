import type { Building, SceneCommand } from '@refloor/scene';
import type { ChatTarget } from '@refloor/scene/chat';
import { cinemaCommands } from '@refloor/catalogue/room-lighting';

type DeviceCommand = { commands: SceneCommand[]; message: string };
const normalize = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');
const noun = (text = '') => normalize(text).replace(/^(?:the|this|my) /, '');

export function deviceCommands(
  building: Building,
  target: ChatTarget,
  message: string,
): DeviceCommand | null {
  const text = normalize(message)
      .replace(/^please /, '')
      .replace(/ please$/, ''),
    opening = /^(open|close|shut)(?: (.+))?$/.exec(text);
  if (target.kind === 'door') {
    if (!opening || !['', 'it', 'door'].includes(noun(opening[2]))) return null;
    const open = opening[1] === 'open';
    return {
      commands: [{ type: 'set-door', doorId: target.id, open }],
      message: open ? 'Opened the door.' : 'Closed the door.',
    };
  }
  if (target.kind !== 'object') return null;
  const object = building.objects.find((item) => item.id === target.id);
  if (!object) return null;
  if (
    /^(?:(?:activate|enable|turn on) )?(?:cinema|cinematic|movie) mode$/.test(text) &&
    object.behaviours.some((value) => value.kind === 'television')
  )
    return {
      commands: cinemaCommands(building, object.id),
      message:
        'Switched off the ceiling lights and dimmed any accent lamps in this room for cinema viewing.',
    };
  const aliases = {
    television: ['tv', 'television', 'video'],
    light: ['light', 'lamp', 'lights'],
    cooker: ['cooker', 'stove', 'hob', 'burners'],
    water:
      object.assetId === 'catalogue/shower'
        ? ['shower', 'water', 'showerhead']
        : ['tap', 'water', 'faucet', 'sink'],
    openable:
      object.assetId === 'catalogue/kitchen-counter'
        ? ['oven', 'oven door']
        : object.assetId === 'catalogue/fridge'
          ? ['fridge', 'refrigerator', 'refrigerator doors']
          : object.assetId === 'catalogue/wardrobe'
            ? ['wardrobe', 'storage', 'doors']
            : ['cabinet', 'drawers', 'storage', 'storage fronts'],
  } as const;
  const match = (name: string | undefined, kinds: (keyof typeof aliases)[]) => {
    const nameValue = noun(name),
      generic = ['', 'it', noun(object.label)].includes(nameValue);
    const candidates = object.behaviours.filter(
      (value) =>
        kinds.includes(value.kind) &&
        (generic || (aliases[value.kind] as readonly string[]).includes(nameValue)),
    );
    return candidates.length === 1 ? candidates[0] : null;
  };
  const reversed = /^(?:turn|switch) (.+) (on|off)$/.exec(text),
    power = /^(?:(?:turn|switch) )?(on|off)(?: (.+))?$/.exec(text);
  if (power || reversed) {
    const powered = (power?.[1] ?? reversed?.[2]) === 'on',
      capability = match(power?.[2] ?? reversed?.[1], ['television', 'light', 'cooker', 'water']);
    if (!capability) return null;
    const command: SceneCommand =
      capability.kind === 'water'
        ? powered
          ? { type: 'start-water', objectId: object.id }
          : { type: 'set-water', objectId: object.id, state: { powered } }
        : capability.kind === 'cooker'
          ? powered
            ? { type: 'ignite-cooker', objectId: object.id }
            : { type: 'set-cooker', objectId: object.id, state: { powered } }
          : capability.kind === 'television'
            ? { type: 'set-television', objectId: object.id, state: { powered } }
            : { type: 'set-light', objectId: object.id, state: { powered } };
    return {
      commands: [command],
      message: `Turned ${powered ? 'on' : 'off'} the ${capability.kind === 'water' ? 'water' : capability.kind}.`,
    };
  }
  if (opening) {
    const open = opening[1] === 'open',
      capability = match(opening[2], ['water', 'openable']);
    if (!capability) return null;
    return capability.kind === 'water'
      ? {
          commands: [
            open
              ? { type: 'start-water', objectId: object.id }
              : { type: 'set-water', objectId: object.id, state: { powered: false } },
          ],
          message: `${open ? 'Started' : 'Stopped'} the water.`,
        }
      : {
          commands: [{ type: 'set-openable', objectId: object.id, state: { open } }],
          message: `${open ? 'Opened' : 'Closed'} ${object.label}.`,
        };
  }
  const mute = /^(mute|unmute)(?: (.+))?$/.exec(text);
  if (mute && match(mute[2], ['television'])) {
    const muted = mute[1] === 'mute';
    return {
      commands: [{ type: 'set-television', objectId: object.id, state: { muted } }],
      message: muted ? 'Muted the television.' : 'Unmuted the television.',
    };
  }
  const volume =
    /^(?:set |change )?(?:(?:the )?volume|(?:the )?(?:tv|television) volume)(?: to)? (\d{1,3})%$/.exec(
      text,
    );
  if (volume && Number(volume[1]) <= 100 && match(undefined, ['television']))
    return {
      commands: [
        { type: 'set-television', objectId: object.id, state: { volume: Number(volume[1]) / 100 } },
      ],
      message: `Set volume to ${volume[1]}%.`,
    };
  return null;
}
