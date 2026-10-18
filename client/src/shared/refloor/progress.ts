import { z } from 'zod';
import { generationSchema } from '@refloor/scene/contracts';
import { authenticated, request } from '@/shared/refloor/client';

const key = 'refloor.generation.v1';
const pendingSchema = z.strictObject({
  requestId: z.uuid(),
  prompt: z.string(),
  jobId: z.uuid().nullable(),
});
export type PendingGeneration = z.infer<typeof pendingSchema>;
export function restoreGeneration(): PendingGeneration | null {
  try {
    return pendingSchema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'));
  } catch {
    return null;
  }
}
export function persistGeneration(pending: PendingGeneration | null) {
  try {
    if (pending) localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
  } catch {
    /* The active page retains its request ID if browser storage is unavailable. */
  }
}
export const generationApi = {
  create: (pending: PendingGeneration) =>
    authenticated(() =>
      request('/generations', generationSchema, 'POST', {
        requestId: pending.requestId,
        prompt: pending.prompt,
      }),
    ),
  get: (id: string) => authenticated(() => request(`/generations/${id}`, generationSchema)),
};
