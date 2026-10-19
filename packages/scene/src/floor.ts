import { z } from 'zod';
import { doorStateSchema } from '@refloor/scene/behaviour';
import { materialSchema } from '@refloor/scene/material';
import {
  coordinateSchema,
  dimensionSchema,
  footprintSchema,
  idSchema,
  labelSchema,
  pointSchema,
} from '@refloor/scene/primitives';
import { roomSchema } from '@refloor/scene/room';

const openingFields = {
  id: idSchema,
  offset: coordinateSchema.nonnegative(),
  width: dimensionSchema,
  height: dimensionSchema,
  material: materialSchema,
};
export const doorSchema = z.strictObject({
  ...openingFields,
  kind: z.literal('door'),
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['inward', 'outward']),
  state: doorStateSchema,
});
export const openingSchema = z.discriminatedUnion('kind', [
  doorSchema,
  z.strictObject({
    ...openingFields,
    kind: z.literal('window'),
    sill: coordinateSchema.nonnegative(),
  }),
]);
export const wallSchema = z.strictObject({
  id: idSchema,
  start: pointSchema,
  end: pointSchema,
  height: dimensionSchema,
  thickness: dimensionSchema,
  material: materialSchema,
  exteriorMaterial: materialSchema.optional(),
  openings: z.array(openingSchema),
});
export const floorSchema = z.strictObject({
  id: idSchema,
  name: labelSchema,
  elevation: coordinateSchema,
  height: dimensionSchema,
  slabThickness: dimensionSchema,
  footprint: footprintSchema,
  rooms: z.array(roomSchema).min(1),
  walls: z.array(wallSchema),
  voids: z.array(
    z.strictObject({ id: idSchema, kind: z.literal('stairwell'), footprint: footprintSchema }),
  ),
});

export type Floor = z.infer<typeof floorSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Door = z.infer<typeof doorSchema>;
