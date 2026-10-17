import { z } from 'zod';
import { footprintSchema, idSchema, labelSchema } from '@refloor/scene/primitives';
import { materialSchema } from '@refloor/scene/material';

export const roomSchema = z.strictObject({
  id: idSchema,
  name: labelSchema,
  kind: z.enum([
    'living',
    'dining',
    'kitchen',
    'bedroom',
    'bathroom',
    'workspace',
    'corridor',
    'stairwell',
    'other',
  ]),
  footprint: footprintSchema,
  wallIds: z.array(idSchema),
  floorMaterial: materialSchema,
});

export type Room = z.infer<typeof roomSchema>;
