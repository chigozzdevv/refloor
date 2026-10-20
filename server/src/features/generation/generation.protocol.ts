import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { generationUsageSchema } from '@refloor/scene/contracts';

export const generationWorkerMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('progress'),
    status: z.enum(['layout', 'validating']),
    usage: generationUsageSchema,
  }),
  z.strictObject({
    type: z.literal('complete'),
    building: buildingSchema,
    usage: generationUsageSchema,
  }),
  z.strictObject({
    type: z.literal('failed'),
    error: z.string(),
    usage: generationUsageSchema.nullable(),
  }),
]);

export type GenerationWorkerMessage = z.infer<typeof generationWorkerMessageSchema>;
export type GenerationWorkerProgress = Extract<GenerationWorkerMessage, { type: 'progress' }>;
export type GenerationWorkerResult = Omit<
  Extract<GenerationWorkerMessage, { type: 'complete' }>,
  'type'
>;
