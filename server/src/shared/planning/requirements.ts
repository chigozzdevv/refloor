import { z } from 'zod';

export const roomUseSchema = z.enum([
  'living',
  'dining',
  'kitchen',
  'bedroom',
  'bathroom',
  'workspace',
]);
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
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  upholsteryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  flooring: z.enum(['oak', 'walnut', 'tile']),
  roof: z.enum(['flat', 'gable']),
  unsupported: z.array(z.string().max(200)).max(10),
});

export type HouseRequirements = z.infer<typeof requirementsSchema>;
export type RoomRequirement = HouseRequirements['rooms'][number];

export function validateRequirements(input: unknown): HouseRequirements {
  const requirements = requirementsSchema.parse(input);
  if (requirements.unsupported.length)
    throw new Error(
      `This request needs unsupported features: ${requirements.unsupported.join('; ')}`,
    );
  if (
    [requirements.width, requirements.depth].some(
      (value) => value !== null && Math.abs(value * 10 - Math.round(value * 10)) > 1e-6,
    )
  )
    throw new Error('House dimensions currently use 0.1 metre increments.');
  for (let floor = 0; floor < requirements.storeys; floor++) {
    const rooms = requirements.rooms.filter((room) => room.floor === floor);
    if (rooms.length < 2 || rooms.length > 8)
      throw new Error(
        'Each floor currently supports two to eight rooms around a circulation hall.',
      );
  }
  if (requirements.rooms.some((room) => room.floor >= requirements.storeys))
    throw new Error('The room programme references a floor outside the requested house.');
  if (requirements.rooms.filter((room) => room.uses.includes('living')).length !== 1)
    throw new Error('The house must contain one main living area.');
  if (requirements.rooms.some((room) => new Set(room.uses).size !== room.uses.length))
    throw new Error('A room cannot repeat the same use.');
  if (
    requirements.rooms.some(
      (room) =>
        room.uses.length > 1 && room.uses.some((use) => !['living', 'dining'].includes(use)),
    )
  )
    throw new Error(
      'Combined rooms currently support an open living and dining area. Request other spaces as separate rooms.',
    );
  if (requirements.rooms.some((room) => room.uses.includes('living') && room.floor !== 0))
    throw new Error('The main living area must be on the ground floor.');
  if (
    new Set(requirements.rooms.map((room) => room.name.toLowerCase())).size !==
    requirements.rooms.length
  )
    throw new Error('Room names must be unique.');
  return requirements;
}
