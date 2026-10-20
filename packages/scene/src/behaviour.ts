import { z } from 'zod';
import { colorSchema, labelSchema } from '@refloor/scene/primitives';

export const cookerIgnitionHeat = 0.6;
export const waterStartFlow = 0.55;

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
export const cookerStateSchema = z.strictObject({
  powered: z.boolean(),
  heat: z.number().finite().min(0).max(1),
  burners: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
});
export const waterStateSchema = z.strictObject({
  powered: z.boolean(),
  flow: z.number().finite().min(0).max(1),
  temperature: z.number().finite().min(10).max(60),
});
export const openableStateSchema = z.strictObject({ open: z.boolean() });
export const poweredBehaviourKindSchema = z.enum(['television', 'light', 'cooker', 'water']);
export const behaviourSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('television'),
    screenNode: labelSchema,
    state: televisionStateSchema,
  }),
  z.strictObject({ kind: z.literal('light'), state: lightStateSchema }),
  z.strictObject({ kind: z.literal('cooker'), state: cookerStateSchema }),
  z.strictObject({ kind: z.literal('water'), state: waterStateSchema }),
  z.strictObject({ kind: z.literal('openable'), state: openableStateSchema }),
]);

export type Behaviour = z.infer<typeof behaviourSchema>;
export type PoweredBehaviourKind = z.infer<typeof poweredBehaviourKindSchema>;
export type PoweredBehaviour = Extract<Behaviour, { kind: PoweredBehaviourKind }>;

export function isPoweredBehaviour(behaviour: Behaviour): behaviour is PoweredBehaviour {
  return 'powered' in behaviour.state;
}
