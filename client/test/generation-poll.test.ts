import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Generation } from '@refloor/scene/contracts';
import { ProjectApiError } from '@/shared/refloor/client';
import { generationApi, watchGeneration } from '@/shared/refloor/progress';

const pending = { requestId: crypto.randomUUID(), jobId: null, prompt: 'A bright bungalow.' };
const job: Generation = {
  id: crypto.randomUUID(),
  status: 'layout',
  projectId: null,
  error: null,
  usage: null,
};
const unavailable = new ProjectApiError('UNAVAILABLE', 'Connection lost', true);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('replays a lost submission with the same request ID, then polls its returned job', async () => {
  const create = vi
      .spyOn(generationApi, 'create')
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue(job),
    get = vi
      .spyOn(generationApi, 'get')
      .mockResolvedValue({ ...job, status: 'complete', projectId: crypto.randomUUID() }),
    update = vi.fn(),
    fail = vi.fn();
  const stop = watchGeneration(pending, update, fail);
  await vi.advanceTimersByTimeAsync(1500);
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls.map(([input]) => input.requestId)).toEqual([
    pending.requestId,
    pending.requestId,
  ]);
  await vi.advanceTimersByTimeAsync(1500);
  expect(get).toHaveBeenCalledExactlyOnceWith(job.id);
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'complete' }), {
    ...pending,
    jobId: job.id,
  });
  expect(fail).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  stop();
});

it('reconnects to an existing job after temporary status failures without submitting another house', async () => {
  const create = vi.spyOn(generationApi, 'create'),
    get = vi
      .spyOn(generationApi, 'get')
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue({ ...job, status: 'failed', error: 'Rooms do not fit.' }),
    update = vi.fn(),
    fail = vi.fn();
  watchGeneration({ ...pending, jobId: job.id }, update, fail);
  await vi.advanceTimersByTimeAsync(4500);
  expect(get).toHaveBeenCalledTimes(3);
  expect(create).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'failed' }),
    expect.anything(),
  );
  expect(fail).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds automatic retries and leaves the original request available for manual recovery', async () => {
  const get = vi.spyOn(generationApi, 'get').mockRejectedValue(unavailable),
    update = vi.fn(),
    fail = vi.fn();
  watchGeneration({ ...pending, jobId: job.id }, update, fail);
  await vi.advanceTimersByTimeAsync(22500);
  expect(get).toHaveBeenCalledTimes(5);
  expect(update).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledExactlyOnceWith(unavailable);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  new ProjectApiError('GENERATION_NOT_FOUND', 'Expired'),
  new ProjectApiError('GENERATION_UNAVAILABLE', 'Not configured', true),
])('does not retry a terminal API failure', async (error) => {
  const get = vi.spyOn(generationApi, 'get').mockRejectedValue(error),
    fail = vi.fn();
  watchGeneration({ ...pending, jobId: job.id }, vi.fn(), fail);
  await vi.advanceTimersByTimeAsync(30000);
  expect(get).toHaveBeenCalledTimes(1);
  expect(fail).toHaveBeenCalledExactlyOnceWith(error);
});

it('cancels a scheduled reconnection when the prompt leaves the screen', async () => {
  const get = vi.spyOn(generationApi, 'get').mockRejectedValue(unavailable);
  const stop = watchGeneration({ ...pending, jobId: job.id }, vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(get).toHaveBeenCalledTimes(1);
});

it('ignores an in-flight response after cancellation', async () => {
  let finish: (job: Generation) => void = () => undefined;
  vi.spyOn(generationApi, 'get').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const update = vi.fn(),
    fail = vi.fn();
  const stop = watchGeneration({ ...pending, jobId: job.id }, update, fail);
  stop();
  finish(job);
  await vi.advanceTimersByTimeAsync(0);
  expect(update).not.toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
