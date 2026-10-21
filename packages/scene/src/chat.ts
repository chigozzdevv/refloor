import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { commandSchema } from '@refloor/scene/command';
import { pointSchema } from '@refloor/scene/primitives';
import { playerSchema, generationUsageSchema } from '@refloor/scene/contracts';
import { editTargetSchema, editMemorySchema } from '@refloor/scene/edit-memory';
import { propertyGuardSchema } from '@refloor/scene/properties';

export const chatTargetSchema = editTargetSchema;
export const languageEditRequestSchema = z.strictObject({
  requestId: z.uuid(),
  building: buildingSchema,
  target: chatTargetSchema,
  message: z.string().trim().min(1).max(500),
  view: pointSchema,
  player: playerSchema.nullable(),
  context: editMemorySchema.optional(),
});
export const languageEditResponseSchema = z.strictObject({
  requestId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  message: z.string(),
  commands: z.array(commandSchema).max(100),
  guards: z.array(propertyGuardSchema).max(2000).optional(),
  usage: generationUsageSchema,
});
export type ChatTarget = z.infer<typeof chatTargetSchema>;
export type LanguageEditRequest = z.infer<typeof languageEditRequestSchema>;
export type LanguageEditResponse = z.infer<typeof languageEditResponseSchema>;
