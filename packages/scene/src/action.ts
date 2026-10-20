import { z } from 'zod';
import { lightStateSchema, televisionStateSchema } from '@refloor/scene/behaviour';
import { materialSchema } from '@refloor/scene/material';
import { objectAssetSchema, sceneObjectSchema } from '@refloor/scene/object';
import {
  coordinateSchema,
  dimensionsSchema,
  idSchema,
  objectPositionSchema,
} from '@refloor/scene/primitives';

export const sceneActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('add-object'),
    object: sceneObjectSchema,
    index: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ type: z.literal('remove-object'), objectId: idSchema }),
  z.strictObject({
    type: z.literal('translate-object'),
    objectId: idSchema,
    delta: z.strictObject({ x: coordinateSchema, y: coordinateSchema, z: coordinateSchema }),
  }),
  z.strictObject({
    type: z.literal('turn-object'),
    objectId: idSchema,
    radians: coordinateSchema,
  }),
  z.strictObject({
    type: z.literal('move-object'),
    objectId: idSchema,
    roomId: idSchema,
    position: objectPositionSchema,
    rotation: coordinateSchema,
  }),
  z.strictObject({
    type: z.literal('rotate-object'),
    objectId: idSchema,
    rotation: coordinateSchema,
  }),
  z.strictObject({
    type: z.literal('resize-object'),
    objectId: idSchema,
    dimensions: dimensionsSchema,
  }),
  z.strictObject({
    type: z.literal('replace-object'),
    objectId: idSchema,
    asset: objectAssetSchema,
  }),
  z.strictObject({
    type: z.literal('set-object-material'),
    objectId: idSchema,
    slot: idSchema,
    material: materialSchema,
  }),
  z.strictObject({
    type: z.literal('set-wall-material'),
    wallId: idSchema,
    material: materialSchema,
    preserveExterior: z.boolean().optional(),
    exteriorMaterial: materialSchema.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal('set-wall-exterior-material'),
    wallId: idSchema,
    material: materialSchema.nullable(),
  }),
  z.strictObject({
    type: z.literal('set-roof-material'),
    roofId: idSchema,
    material: materialSchema,
  }),
  z.strictObject({
    type: z.literal('set-room-floor-material'),
    roomId: idSchema,
    material: materialSchema,
  }),
  z.strictObject({ type: z.literal('set-door'), doorId: idSchema, open: z.boolean() }),
  z.strictObject({
    type: z.literal('set-television'),
    objectId: idSchema,
    state: televisionStateSchema
      .partial()
      .refine(
        (state) => Object.values(state).some((value) => value !== undefined),
        'Provide a television state change',
      ),
  }),
  z.strictObject({
    type: z.literal('set-light'),
    objectId: idSchema,
    state: lightStateSchema
      .partial()
      .refine(
        (state) => Object.values(state).some((value) => value !== undefined),
        'Provide a light state change',
      ),
  }),
  z.strictObject({
    type: z.literal('adjust-light-intensity'),
    objectId: idSchema,
    delta: coordinateSchema,
    limits: z
      .strictObject({
        min: coordinateSchema.min(0).max(100),
        max: coordinateSchema.min(0).max(100),
      })
      .refine((limits) => limits.min <= limits.max, 'Brightness limits are reversed'),
  }),
  z.strictObject({
    type: z.literal('adjust-television-volume'),
    objectId: idSchema,
    delta: coordinateSchema,
  }),
]);

export type SceneAction = z.infer<typeof sceneActionSchema>;
