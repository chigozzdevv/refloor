import { z } from 'zod';

export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const labelSchema = z.string().trim().min(1).max(160);
export const coordinateSchema = z.number().finite();
export const dimensionSchema = coordinateSchema.positive();
export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .toLowerCase();
export const pointSchema = z.strictObject({ x: coordinateSchema, z: coordinateSchema });
export const positionSchema = pointSchema.extend({ y: coordinateSchema.nonnegative() });
export const objectPositionSchema = pointSchema.extend({ y: coordinateSchema.min(-0.25) });
export const footprintSchema = pointSchema.extend({
  width: dimensionSchema,
  depth: dimensionSchema,
});
export const dimensionsSchema = z.strictObject({
  width: dimensionSchema,
  height: dimensionSchema,
  depth: dimensionSchema,
});

export type Footprint = z.infer<typeof footprintSchema>;
export type Position = z.infer<typeof positionSchema>;
