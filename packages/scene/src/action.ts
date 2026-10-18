import { z } from 'zod';
import { lightStateSchema, televisionStateSchema } from '@refloor/scene/behaviour';
import { materialSchema } from '@refloor/scene/material';
import { objectAssetSchema, sceneObjectSchema } from '@refloor/scene/object';
import {
  coordinateSchema,
  dimensionsSchema,
  idSchema,
  positionSchema,
} from '@refloor/scene/primitives';

export const sceneActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('add-object'),
    object: sceneObjectSchema,
    index: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ type: z.literal('remove-object'), objectId: idSchema }),
  z.strictObject({
    type: z.literal('move-object'),
    objectId: idSchema,
    roomId: idSchema,
    position: positionSchema,
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
]);

export type SceneAction = z.infer<typeof sceneActionSchema>;
