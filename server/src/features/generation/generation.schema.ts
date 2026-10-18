import { z } from 'zod';

export const generationParamsSchema = z.strictObject({ id: z.uuid() });
