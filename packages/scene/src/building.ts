import { z } from 'zod';
import { floorSchema } from '@refloor/scene/floor';
import { materialSchema } from '@refloor/scene/material';
import { sceneObjectSchema } from '@refloor/scene/object';
import {
  coordinateSchema,
  dimensionSchema,
  footprintSchema,
  idSchema,
  labelSchema,
} from '@refloor/scene/primitives';

export const staircaseSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['straight', 'u-shaped']),
  lowerFloorId: idSchema,
  upperFloorId: idSchema,
  openingId: idSchema,
  footprint: footprintSchema,
  heading: coordinateSchema,
  flightWidth: dimensionSchema,
  landingDepth: dimensionSchema,
  treadDepth: dimensionSchema,
  risers: z.number().int().min(2).max(100),
  material: materialSchema,
});
export const buildingModelSchema = z.strictObject({
  schemaVersion: z.literal(1),
  units: z.literal('metres'),
  id: idSchema,
  name: labelSchema,
  revision: z.number().int().nonnegative(),
  floors: z.array(floorSchema).min(1).max(10),
  stairs: z.array(staircaseSchema),
  objects: z.array(sceneObjectSchema),
  roof: z.strictObject({
    id: idSchema,
    kind: z.enum(['flat', 'gable']),
    pitch: coordinateSchema.min(0).max(Math.PI / 3),
    overhang: coordinateSchema.nonnegative(),
    material: materialSchema,
  }),
});

export type Building = z.infer<typeof buildingModelSchema>;
