import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { idSchema } from '@refloor/scene/primitives';
import { revisionSchema } from '@refloor/scene/revision';

export const maxDesigns = 6;
export const maxDesignBytes = 768 * 1024;
export const designNameSchema = z.string().trim().min(1).max(64);
export const designCheckpointSchema = z.strictObject({
  id: idSchema,
  name: designNameSchema,
  at: z.iso.datetime({ offset: true }),
  building: buildingSchema,
});
export const designHistoryRecordSchema = z.strictObject({
  revision: revisionSchema,
  label: z.string().max(500),
  source: z.enum(['chat', 'manual', 'navigation']),
  undoable: z.boolean().optional(),
  target: z.string().max(500).optional(),
});
export type DesignCheckpoint = z.infer<typeof designCheckpointSchema>;
