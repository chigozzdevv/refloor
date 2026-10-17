import { z } from 'zod';
import { colorSchema, idSchema } from '@refloor/scene/primitives';

export const materialSchema = z.strictObject({
  color: colorSchema,
  roughness: z.number().finite().min(0).max(1),
  metalness: z.number().finite().min(0).max(1),
  opacity: z.number().finite().min(0).max(1),
  textureId: idSchema.nullable(),
});

export type Material = z.infer<typeof materialSchema>;
