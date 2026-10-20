import { z } from 'zod';
import { behaviourSchema } from '@refloor/scene/behaviour';
import { materialSchema } from '@refloor/scene/material';
import {
  coordinateSchema,
  dimensionsSchema,
  idSchema,
  labelSchema,
  objectPositionSchema,
} from '@refloor/scene/primitives';

export const objectAssetSchema = z.strictObject({
  assetId: idSchema,
  label: labelSchema,
  kind: z.enum([
    'sofa',
    'chair',
    'bed',
    'table',
    'television',
    'light',
    'storage',
    'decor',
    'custom',
  ]),
  dimensions: dimensionsSchema,
  materials: z
    .record(idSchema, materialSchema)
    .refine((value) => Object.keys(value).length > 0, 'An asset needs at least one material slot'),
  behaviours: z.array(behaviourSchema).max(3),
});
export const sceneObjectSchema = objectAssetSchema.extend({
  id: idSchema,
  floorId: idSchema,
  roomId: idSchema,
  placement: z.literal('exterior').optional(),
  position: objectPositionSchema,
  rotation: coordinateSchema,
});

export type ObjectAsset = z.infer<typeof objectAssetSchema>;
export type SceneObject = z.infer<typeof sceneObjectSchema>;

export function getObjectAsset(object: SceneObject): ObjectAsset {
  return {
    assetId: object.assetId,
    label: object.label,
    kind: object.kind,
    dimensions: object.dimensions,
    materials: object.materials,
    behaviours: object.behaviours,
  };
}
