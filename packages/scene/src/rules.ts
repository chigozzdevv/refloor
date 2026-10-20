import { z } from 'zod';
import { sceneActionSchema } from '@refloor/scene/action';
import { idSchema, labelSchema } from '@refloor/scene/primitives';
import type { Building } from '@refloor/scene/building';
import { isPoweredBehaviour, poweredBehaviourKindSchema } from '@refloor/scene/behaviour';

export const ruleConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('door'), doorId: idSchema, open: z.boolean() }),
  z.strictObject({
    kind: z.literal('power'),
    objectId: idSchema,
    powered: z.boolean(),
    behaviour: poweredBehaviourKindSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('openable'), objectId: idSchema, open: z.boolean() }),
]);
export const sceneEventSchema = z.discriminatedUnion('kind', [
  ...ruleConditionSchema.options,
  z.strictObject({ kind: z.literal('room-enter'), roomId: idSchema }),
  z.strictObject({ kind: z.literal('object-click'), objectId: idSchema }),
]);
export const sceneRuleSchema = z.strictObject({
  id: idSchema,
  label: labelSchema,
  enabled: z.boolean(),
  trigger: sceneEventSchema,
  conditions: z.array(ruleConditionSchema).max(8),
  actions: z.array(sceneActionSchema).min(1).max(12),
});
export type SceneEvent = z.infer<typeof sceneEventSchema>;
export type RuleCondition = z.infer<typeof ruleConditionSchema>;
export type SceneRule = z.infer<typeof sceneRuleSchema>;

export function conditionMatches(building: Building, condition: RuleCondition) {
  if (condition.kind === 'door')
    return building.floors.some((floor) =>
      floor.walls.some((wall) =>
        wall.openings.some(
          (door) =>
            door.id === condition.doorId &&
            door.kind === 'door' &&
            door.state.open === condition.open,
        ),
      ),
    );
  const object = building.objects.find((value) => value.id === condition.objectId);
  if (condition.kind === 'openable')
    return (
      object?.behaviours.some(
        (behaviour) => behaviour.kind === 'openable' && behaviour.state.open === condition.open,
      ) ?? false
    );
  return (
    object?.behaviours.some(
      (behaviour) =>
        isPoweredBehaviour(behaviour) &&
        (!condition.behaviour || behaviour.kind === condition.behaviour) &&
        behaviour.state.powered === condition.powered,
    ) ?? false
  );
}

export function eventMatches(trigger: SceneEvent, event: SceneEvent) {
  if (trigger.kind !== event.kind) return false;
  switch (trigger.kind) {
    case 'door':
      return (
        event.kind === 'door' && trigger.doorId === event.doorId && trigger.open === event.open
      );
    case 'power':
      return (
        event.kind === 'power' &&
        trigger.objectId === event.objectId &&
        trigger.powered === event.powered &&
        (!trigger.behaviour || trigger.behaviour === event.behaviour)
      );
    case 'openable':
      return (
        event.kind === 'openable' &&
        trigger.objectId === event.objectId &&
        trigger.open === event.open
      );
    case 'room-enter':
      return event.kind === 'room-enter' && trigger.roomId === event.roomId;
    case 'object-click':
      return event.kind === 'object-click' && trigger.objectId === event.objectId;
  }
}

export function eventTargetExists(building: Building, event: SceneEvent) {
  if (event.kind === 'door')
    return building.floors.some((floor) =>
      floor.walls.some((wall) =>
        wall.openings.some((opening) => opening.kind === 'door' && opening.id === event.doorId),
      ),
    );
  if (event.kind === 'room-enter')
    return building.floors.some((floor) => floor.rooms.some((room) => room.id === event.roomId));
  const object = building.objects.find((value) => value.id === event.objectId);
  if (event.kind === 'openable')
    return object?.behaviours.some((behaviour) => behaviour.kind === 'openable') ?? false;
  if (event.kind === 'power')
    return (
      object?.behaviours.some(
        (behaviour) =>
          isPoweredBehaviour(behaviour) && (!event.behaviour || behaviour.kind === event.behaviour),
      ) ?? false
    );
  return Boolean(object);
}
