import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { editSchema } from '@refloor/scene/command';
import { revisionSchema } from '@refloor/scene/revision';
import { positionSchema, idSchema } from '@refloor/scene/primitives';
import { editMemorySchema } from '@refloor/scene/edit-memory';

export const playerSchema = z.strictObject({ floorId: idSchema, position: positionSchema });
export const requestIdSchema = z.uuid();
export const projectCreateSchema = z.strictObject({
  requestId: requestIdSchema,
  building: buildingSchema,
  memory: editMemorySchema.optional(),
});
export const projectSaveSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: z.number().int().nonnegative(),
  building: buildingSchema,
  memory: editMemorySchema.optional(),
});
export const projectEditSchema = z.strictObject({
  edit: editSchema,
  player: playerSchema.nullable(),
});
export const projectHistorySchema = z.strictObject({
  id: requestIdSchema,
  at: z.iso.datetime({ offset: true }),
  expectedRevision: z.number().int().nonnegative(),
  player: playerSchema.nullable(),
});
export const projectSummarySchema = z.strictObject({
  id: requestIdSchema,
  name: z.string(),
  version: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  storeys: z.number().int().positive(),
  objectCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});
export const projectSchema = projectSummarySchema.extend({
  building: buildingSchema,
  memory: editMemorySchema.optional(),
});
export const projectWriteSchema = z.strictObject({
  project: projectSchema,
  acceptedVersion: z.number().int().nonnegative(),
  replayed: z.boolean(),
  revision: revisionSchema.nullable(),
});
export const projectListSchema = z.strictObject({
  items: z.array(projectSummarySchema),
  nextCursor: z.string().nullable(),
});
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    issues: z
      .array(
        z.strictObject({ code: z.string(), message: z.string(), entityId: z.string().optional() }),
      )
      .optional(),
  }),
});
export type Project = z.infer<typeof projectSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectWrite = z.infer<typeof projectWriteSchema>;
export type ProjectList = z.infer<typeof projectListSchema>;
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectSave = z.infer<typeof projectSaveSchema>;
export type ProjectEdit = z.infer<typeof projectEditSchema>;
export type ProjectHistory = z.infer<typeof projectHistorySchema>;

export const generationRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  prompt: z.string().trim().min(10).max(2000),
});
export const generationUsageSchema = z.strictObject({
  model: z.string(),
  responseId: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
export const generationSchema = z.strictObject({
  id: requestIdSchema,
  status: z.enum([
    'queued',
    'interpreting',
    'layout',
    'validating',
    'saving',
    'complete',
    'failed',
  ]),
  projectId: requestIdSchema.nullable(),
  error: z.string().nullable(),
  usage: generationUsageSchema.nullable(),
});
export type Generation = z.infer<typeof generationSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
