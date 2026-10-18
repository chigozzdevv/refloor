import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { commandSchema } from '@refloor/scene/command';
import { idSchema, pointSchema } from '@refloor/scene/primitives';
import { playerSchema, generationUsageSchema } from '@refloor/scene/contracts';

export const chatTargetSchema = z.strictObject({
  kind: z.enum(['house', 'object', 'wall', 'floor', 'door']),
  id: idSchema,
});
export const languageEditRequestSchema = z.strictObject({
  requestId: z.uuid(),
  building: buildingSchema,
  target: chatTargetSchema,
  message: z.string().trim().min(1).max(500),
  view: pointSchema,
  player: playerSchema.nullable(),
});
export const languageEditResponseSchema = z.strictObject({
  requestId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  message: z.string(),
  commands: z.array(commandSchema).max(100),
  usage: generationUsageSchema,
});
export type ChatTarget = z.infer<typeof chatTargetSchema>;
export type LanguageEditRequest = z.infer<typeof languageEditRequestSchema>;
