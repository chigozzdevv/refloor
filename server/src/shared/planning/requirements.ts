import { z } from 'zod';
import { GenerationFailure } from '@refloor/server/features/generation/generation.error';

export const roomUseSchema = z.enum([
  'living',
  'dining',
  'kitchen',
  'bedroom',
  'bathroom',
  'workspace',
]);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const circulationSchema = z.strictObject({
  family: z.enum(['central-hall', 'side-gallery', 'living-hub']),
  gallerySide: z.enum(['left', 'right']),
  stairPosition: z.enum(['front', 'rear']),
  balance: z.enum(['balanced', 'public-wide']).nullish(),
  footprint: z.enum(['rectangle', 'l-shaped']).nullish(),
});
export const designSchema = z.strictObject({
  style: z.enum(['warm-contemporary', 'natural-minimal', 'moody-modern']),
  joinery: z.enum(['oak', 'walnut']),
  hardware: z.enum(['black', 'brass']),
  glazing: z.enum(['standard', 'generous']).nullish(),
  audio: z.enum(['television', 'stereo']).nullish(),
  exterior: z.strictObject({
    finish: z.enum(['plaster', 'brick', 'marble']),
    color: colorSchema,
  }),
  roof: z.strictObject({
    finish: z.enum(['asphalt', 'metal']),
    color: colorSchema,
  }),
});
export const requirementsSchema = z.strictObject({
  name: z.string().min(1).max(80),
  storeys: z.number().int().min(1).max(2),
  width: z.number().min(14).max(20).nullable(),
  depth: z.number().min(9).max(24).nullable(),
  rooms: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(80),
        floor: z.number().int().min(0).max(1),
        uses: z.array(roomUseSchema).min(1).max(3),
        size: z.enum(['compact', 'standard', 'spacious']),
        side: z.enum(['left', 'right']).nullable(),
        position: z.enum(['front', 'middle', 'rear']),
      }),
    )
    .min(2)
    .max(12),
  circulation: circulationSchema.nullish(),
  design: designSchema.nullish(),
  wallColor: colorSchema,
  upholsteryColor: colorSchema,
  flooring: z.enum(['oak', 'walnut', 'tile']),
  roof: z.enum(['flat', 'gable']),
  unsupported: z.array(z.string().max(200)).max(10),
});

export type HouseRequirements = z.infer<typeof requirementsSchema>;
export type RoomRequirement = HouseRequirements['rooms'][number];

export const houseResponseSchema = z.strictObject({
  requirements: requirementsSchema
    .omit({ unsupported: true })
    .extend({
      circulation: circulationSchema
        .extend({
          balance: z.enum(['balanced', 'public-wide']).nullable(),
          footprint: z.enum(['rectangle', 'l-shaped']).nullable(),
        })
        .nullable(),
      design: designSchema
        .extend({
          glazing: z.enum(['standard', 'generous']).nullable(),
          audio: z.enum(['television', 'stereo']).nullable(),
        })
        .nullable(),
    })
    .nullable(),
  unsupported: z.array(z.string().max(200)).max(10),
});

export function validateRequirements(input: unknown): HouseRequirements {
  const requirements = requirementsSchema.parse(input);
  if (
    requirements.circulation?.footprint === 'l-shaped' &&
    (requirements.storeys !== 1 ||
      requirements.roof !== 'flat' ||
      requirements.circulation.family === 'side-gallery')
  )
    throw new GenerationFailure(
      'L-shaped footprints currently support flat-roof bungalows with a central hall or direct parlor connections.',
    );
  if (requirements.unsupported.length)
    throw new GenerationFailure(
      `This request needs unsupported features: ${requirements.unsupported.join('; ')}`,
    );
  if (
    [requirements.width, requirements.depth].some(
      (value) => value !== null && Math.abs(value * 10 - Math.round(value * 10)) > 1e-6,
    )
  )
    throw new GenerationFailure('House dimensions currently use 0.1 metre increments.');
  for (let floor = 0; floor < requirements.storeys; floor++) {
    const rooms = requirements.rooms.filter((room) => room.floor === floor);
    if (rooms.length < 2 || rooms.length > 8)
      throw new GenerationFailure('Each floor currently supports two to eight rooms.');
  }
  if (requirements.rooms.some((room) => room.floor >= requirements.storeys))
    throw new GenerationFailure(
      'The room programme references a floor outside the requested house.',
    );
  if (requirements.rooms.filter((room) => room.uses.includes('living')).length !== 1)
    throw new GenerationFailure('The house must contain one main living area.');
  if (requirements.rooms.some((room) => new Set(room.uses).size !== room.uses.length))
    throw new GenerationFailure('A room cannot repeat the same use.');
  if (
    requirements.rooms.some(
      (room) =>
        room.uses.length > 1 &&
        room.uses.some((use) => !['living', 'dining', 'kitchen'].includes(use)),
    )
  )
    throw new GenerationFailure(
      'Open-plan rooms can combine living, dining and kitchen uses. Bedrooms, bathrooms and workspaces need their own enclosed room.',
    );
  if (requirements.rooms.some((room) => room.uses.includes('living') && room.floor !== 0))
    throw new GenerationFailure('The main living area must be on the ground floor.');
  if (
    new Set(requirements.rooms.map((room) => room.name.toLowerCase())).size !==
    requirements.rooms.length
  )
    throw new GenerationFailure('Room names must be unique.');
  if (requirements.circulation?.family === 'side-gallery') {
    const occupiedSide = requirements.circulation.gallerySide === 'left' ? 'right' : 'left';
    if (requirements.rooms.some((room) => room.side !== null && room.side !== occupiedSide))
      throw new GenerationFailure(
        'A side gallery has rooms on its opposite side. Use a central hall for rooms on both sides.',
      );
  }
  if (requirements.circulation?.family === 'living-hub') {
    if (requirements.storeys !== 1)
      throw new GenerationFailure('Direct parlor connections currently support bungalows.');
    const living = requirements.rooms.find((room) => room.uses.includes('living'))!;
    if (requirements.rooms.length < 3 || living.uses.includes('kitchen'))
      throw new GenerationFailure(
        'A living-hub bungalow needs at least two enclosed rooms and a separate kitchen when requested. The parlor can include dining.',
      );
    if (living.side !== null)
      throw new GenerationFailure(
        'The living hub is central; assign sides to its adjoining rooms.',
      );
  }
  return requirements;
}
