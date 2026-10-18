import { z } from 'zod';
import { sceneActionSchema } from '@refloor/scene/action';
import { idSchema, labelSchema } from '@refloor/scene/primitives';
import type { Building } from '@refloor/scene/building';

export const ruleConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('door'), doorId: idSchema, open: z.boolean() }),
  z.strictObject({ kind: z.literal('power'), objectId: idSchema, powered: z.boolean() }),
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
  return (
    building.objects
      .find((object) => object.id === condition.objectId)
      ?.behaviours.some((behaviour) => behaviour.state.powered === condition.powered) ?? false
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
        trigger.powered === event.powered
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
  return Boolean(object && (event.kind !== 'power' || object.behaviours.length));
}
