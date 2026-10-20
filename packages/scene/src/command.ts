import { z } from 'zod';
import { sceneActionSchema } from '@refloor/scene/action';
import { sceneEventSchema, sceneRuleSchema } from '@refloor/scene/rules';
import { idSchema } from '@refloor/scene/primitives';
import { behaviourSchema } from '@refloor/scene/behaviour';

export const commandSchema = z.discriminatedUnion('type', [
  ...sceneActionSchema.options,
  z.strictObject({
    type: z.literal('add-object-behaviours'),
    objectId: idSchema,
    behaviours: z.array(behaviourSchema).min(1).max(3),
    positions: z.array(z.number().int().nonnegative()).min(1).max(3).optional(),
  }),
  z.strictObject({
    type: z.literal('remove-object-behaviours'),
    objectId: idSchema,
    kinds: z
      .array(z.enum(['television', 'light', 'cooker', 'water', 'openable']))
      .min(1)
      .max(3),
  }),
  z.strictObject({
    type: z.literal('set-rules'),
    rules: z.array(sceneRuleSchema).max(32).nullable(),
  }),
  z.strictObject({ type: z.literal('emit-event'), event: sceneEventSchema }),
]);

export const editMetadataSchema = z.strictObject({
  id: idSchema,
  at: z.iso.datetime({ offset: true }),
});
export const editSchema = editMetadataSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  commands: z.array(commandSchema).min(1).max(100),
});

export type SceneCommand = z.infer<typeof commandSchema>;
export type SceneEdit = z.infer<typeof editSchema>;
