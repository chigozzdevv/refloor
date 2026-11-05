import { z } from 'zod';
import { generationSchema } from '@refloor/scene/contracts';
import { authenticated, ProjectApiError, request } from '@/shared/refloor/client';
import type { Generation } from '@refloor/scene/contracts';

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

export function watchGeneration(
  pending: PendingGeneration,
  update: (job: Generation, pending: PendingGeneration) => void,
  fail: (error: unknown) => void,
) {
  let cancelled = false,
    current = pending,
    retries = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    timer = setTimeout(() => void poll(), delay);
  };
  const poll = async () => {
    try {
      const job = current.jobId
        ? await generationApi.get(current.jobId)
        : await generationApi.create(current);
      if (cancelled) return;
      retries = 0;
      current = { ...current, jobId: job.id };
      update(job, current);
      if (job.status !== 'complete' && job.status !== 'failed') schedule(1500);
    } catch (error) {
      if (cancelled) return;
      if (
        error instanceof ProjectApiError &&
        error.retryable &&
        error.code !== 'GENERATION_UNAVAILABLE' &&
        retries < 4
      ) {
        schedule(1500 * 2 ** retries++);
      } else fail(error);
    }
  };
  void poll();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
