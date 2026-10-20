import { z } from 'zod';
import type { SceneCommand, SceneObject } from '@refloor/scene';
import { isPoweredBehaviour } from '@refloor/scene/behaviour';
import { householdOpenableLabel } from '@refloor/catalogue';

export const targetCapabilitySchema = z.enum([
  'television',
  'light',
  'cooker',
  'water',
  'openable',
]);
export type TargetCapability = z.infer<typeof targetCapabilitySchema>;
export const burnerNames = ['front-left', 'front-right', 'back-left', 'back-right'] as const;

type HouseholdAction = {
  action: string;
  targetCapability?: TargetCapability | null | undefined;
  enabled: boolean | null;
  amount: number | null;
  relative: boolean | null;
  value: string | null;
};
const required = <T>(value: T | null): T => {
  if (value === null) throw new Error('Please give a value for this change.');
  return value;
};
const bounded = (current: number, action: HouseholdAction, min: number, max: number) =>
  action.relative === true
    ? Math.max(min, Math.min(max, current + required(action.amount)))
    : required(action.amount);

export function householdCapabilities(object: Pick<SceneObject, 'behaviours' | 'assetId'>) {
  return object.behaviours.map((behaviour) => {
    switch (behaviour.kind) {
      case 'cooker':
        return {
          kind: behaviour.kind,
          actions: ['power', 'cooker-heat', 'cooker-burner', 'restore'],
          heat: { min: 0, max: 1 },
          burners: burnerNames,
        };
      case 'water':
        return {
          kind: behaviour.kind,
          actions: ['power', 'water-flow', 'water-temperature', 'restore'],
          flow: { min: 0, max: 1 },
          temperature: { min: 10, max: 60, unit: 'Celsius' },
        };
      case 'openable':
        return {
          kind: behaviour.kind,
          mechanism: householdOpenableLabel(object.assetId),
          actions: ['open', 'restore'],
        };
      case 'light':
        return {
          kind: behaviour.kind,
          actions: ['power', 'intensity', 'light-color', 'reset-light', 'restore'],
        };
      case 'television':
        return { kind: behaviour.kind, actions: ['power', 'mute', 'volume', 'source', 'restore'] };
    }
  });
}

export function householdCommands(
  object: SceneObject,
  action: HouseholdAction,
  preserveRelative = false,
): SceneCommand[] | null {
  const objectId = object.id;
  const expectedCapability: Record<string, TargetCapability> = {
    mute: 'television',
    volume: 'television',
    source: 'television',
    intensity: 'light',
    'light-color': 'light',
    'reset-light': 'light',
    'cooker-heat': 'cooker',
    'cooker-burner': 'cooker',
    'water-flow': 'water',
    'water-temperature': 'water',
    open: 'openable',
  };
  if (
    action.targetCapability &&
    expectedCapability[action.action] &&
    expectedCapability[action.action] !== action.targetCapability
  )
    throw new Error('The requested action does not match that device capability.');
  if (action.action === 'power') {
    const candidates = object.behaviours.filter(isPoweredBehaviour);
    const selected = action.targetCapability
      ? candidates.find((behaviour) => behaviour.kind === action.targetCapability)
      : candidates.length === 1
        ? candidates[0]
        : null;
    if (!selected) {
      if (candidates.length > 1 && !action.targetCapability)
        throw new Error(
          `Choose which device to control: ${candidates.map((item) => item.kind).join(' or ')}.`,
        );
      throw new Error('This item does not support that power action.');
    }
    const state = { powered: required(action.enabled) };
    switch (selected.kind) {
      case 'television':
        return [{ type: 'set-television', objectId, state }];
      case 'light':
        return [{ type: 'set-light', objectId, state }];
      case 'cooker':
        return state.powered
          ? [{ type: 'ignite-cooker', objectId }]
          : [{ type: 'set-cooker', objectId, state }];
      case 'water':
        return state.powered
          ? [{ type: 'start-water', objectId }]
          : [{ type: 'set-water', objectId, state }];
    }
  }
  const kind = action.action.startsWith('cooker-')
    ? 'cooker'
    : action.action.startsWith('water-')
      ? 'water'
      : action.action === 'open'
        ? 'openable'
        : null;
  if (!kind) return null;
  if (action.targetCapability && action.targetCapability !== kind)
    throw new Error('The requested action does not match that device capability.');
  if (kind === 'cooker') {
    const cooker = object.behaviours.find((behaviour) => behaviour.kind === 'cooker');
    if (!cooker) throw new Error('This item does not have a cooker.');
    if (action.action === 'cooker-heat')
      return [
        preserveRelative && action.relative === true
          ? { type: 'adjust-cooker-heat', objectId, delta: required(action.amount) }
          : {
              type: 'set-cooker',
              objectId,
              state: { heat: bounded(cooker.state.heat, action, 0, 1) },
            },
      ];
    const value = required(action.value),
      enabled = required(action.enabled),
      index = burnerNames.findIndex((name) => name === value);
    if (value !== 'all' && index === -1) throw new Error('Choose an existing cooker burner.');
    return value === 'all'
      ? [
          {
            type: 'set-cooker',
            objectId,
            state: { burners: [enabled, enabled, enabled, enabled], powered: enabled },
          },
          ...(enabled ? [{ type: 'ignite-cooker' as const, objectId }] : []),
        ]
      : [{ type: 'set-cooker-burner', objectId, burner: index as 0 | 1 | 2 | 3, enabled }];
  }

  if (kind === 'water') {
    const water = object.behaviours.find((behaviour) => behaviour.kind === 'water');
    if (!water) throw new Error('This item does not have a tap or shower.');
    const flow = action.action === 'water-flow';
    return [
      preserveRelative && action.relative === true
        ? {
            type: flow ? 'adjust-water-flow' : 'adjust-water-temperature',
            objectId,
            delta: required(action.amount),
          }
        : {
            type: 'set-water',
            objectId,
            state: flow
              ? { flow: bounded(water.state.flow, action, 0, 1) }
              : { temperature: bounded(water.state.temperature, action, 10, 60) },
          },
    ];
  }
  if (!object.behaviours.some((behaviour) => behaviour.kind === 'openable'))
    throw new Error('This item does not have an openable door or drawer.');
  return [{ type: 'set-openable', objectId, state: { open: required(action.enabled) } }];
}
