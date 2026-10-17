import { z } from 'zod';
import { colorSchema, labelSchema } from '@refloor/scene/primitives';

export const mediaSourceSchema = z.union([
  z.httpUrl(),
  z.string().regex(/^asset:[a-zA-Z0-9][a-zA-Z0-9._/-]*$/),
]);
export const televisionStateSchema = z.strictObject({
  powered: z.boolean(),
  muted: z.boolean(),
  volume: z.number().finite().min(0).max(1),
  source: mediaSourceSchema.nullable(),
});
export const lightStateSchema = z.strictObject({
  powered: z.boolean(),
  intensity: z.number().finite().min(0).max(100),
  color: colorSchema,
});
export const doorStateSchema = z.strictObject({ open: z.boolean() });
export const behaviourSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('television'),
    screenNode: labelSchema,
    state: televisionStateSchema,
  }),
  z.strictObject({ kind: z.literal('light'), state: lightStateSchema }),
]);

export type Behaviour = z.infer<typeof behaviourSchema>;
