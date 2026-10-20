import { z } from 'zod';
import { footprintSchema, idSchema, labelSchema } from '@refloor/scene/primitives';
import { materialSchema } from '@refloor/scene/material';

const roomKindSchema = z.enum([
  'living',
  'dining',
  'kitchen',
  'bedroom',
  'bathroom',
  'workspace',
  'corridor',
  'stairwell',
  'other',
]);

export const roomSchema = z.strictObject({
  id: idSchema,
  name: labelSchema,
  kind: roomKindSchema,
  uses: z.array(roomKindSchema).min(1).max(3).optional(),
  footprint: footprintSchema,
  wallIds: z.array(idSchema),
  floorMaterial: materialSchema,
});

export type Room = z.infer<typeof roomSchema>;
