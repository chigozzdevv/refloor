import { z } from 'zod';

export {
  projectCreateSchema as houseCreateSchema,
  projectSaveSchema as houseSaveSchema,
} from '@refloor/scene/contracts';
export const houseParamsSchema = z.strictObject({ id: z.uuid() });
export const houseListSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});
export const houseCursorSchema = z.strictObject({ at: z.iso.datetime(), id: z.uuid() });
export type HouseCursor = z.infer<typeof houseCursorSchema>;
