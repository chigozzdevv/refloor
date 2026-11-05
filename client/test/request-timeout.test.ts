import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { request } from '@/shared/refloor/client';

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
    return controller.signal;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('accepts an edit response after the server model budget without cutting it off at 20 seconds', async () => {
  vi.resetModules();
  const { editApi } = await import('@/shared/refloor/edits');
  const building = createHouse({ id: 'timeout-house', name: 'Timeout house', storeys: 1 });
  const input: LanguageEditRequest = {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'house', id: building.id },
    message: 'Cream walls throughout',
    view: { x: 0, z: -1 },
    player: null,
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (path === '/api/sessions') return json({ ready: true });
    return new Promise((resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
      setTimeout(
        () =>
          resolve(
            json({
              requestId: input.requestId,
              baseRevision: building.revision,
              message: 'Done.',
              commands: [],
              usage: {
                model: 'test',
                responseId: 'test',
                inputTokens: 0,
                outputTokens: 0,
                reasoningTokens: 0,
                durationMs: 26000,
              },
            }),
          ),
        26000,
      );
    });
  });
  const response = editApi.interpret(input);
  await vi.advanceTimersByTimeAsync(26000);
  await expect(response).resolves.toMatchObject({ message: 'Done.' });
  expect(AbortSignal.timeout).toHaveBeenCalledWith(35000);
});

it('reports an expired request separately from a connection failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (_path, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
      }),
  );
  const result = request('/check', { parse: (value) => value }).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await result).toMatchObject({ code: 'TIMEOUT', retryable: true });
  vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('Network failed'));
  await expect(request('/check', { parse: (value) => value })).rejects.toMatchObject({
    code: 'UNAVAILABLE',
    retryable: true,
  });
});
