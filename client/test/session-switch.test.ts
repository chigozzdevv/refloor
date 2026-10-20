import { afterEach, expect, it, vi } from 'vitest';
import { authenticated, request } from '@/shared/refloor/client';
import { sessionApi } from '@/shared/refloor/sessions';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
afterEach(() => vi.restoreAllMocks());

it('waits for initialization when authentication and recovery start in the same task', async () => {
  vi.resetModules();
  const client = await import('@/shared/refloor/client'),
    { sessionApi: keys } = await import('@/shared/refloor/sessions'),
    initialization = deferred<Response>(),
    recovered = deferred<Response>(),
    fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/sessions') return initialization.promise;
      if (path === '/api/sessions/recover') return recovered.promise;
      return json({ ready: true });
    });
  const work = client.authenticated(() =>
      client.request('/simultaneous-check', { parse: (value) => value }),
    ),
    switching = keys.recover(`rf_${'b'.repeat(64)}`);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.anything()));
  expect(fetch.mock.calls.some(([path]) => path === '/api/sessions/recover')).toBe(false);
  initialization.resolve(json({ ready: true }));
  await vi.waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === '/api/sessions/recover')).toBe(true),
  );
  recovered.resolve(json({ ready: true }));
  await switching;
  await work;
  expect(fetch.mock.calls.filter(([path]) => path === '/api/sessions')).toHaveLength(1);
});

it('serializes cookie replacement after initialization and prevents stale authentication retries', async () => {
  const initialization = deferred<Response>(),
    oldRead = deferred<Response>(),
    recovered = deferred<Response>(),
    fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/sessions') return initialization.promise;
      if (path === '/api/old-collection') return oldRead.promise;
      if (path === '/api/sessions/recover') return recovered.promise;
      return json({ ready: true });
    }),
    schema = { parse: (value: unknown) => value };
  const previous = authenticated(() => request('/old-collection', schema));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.anything()));
  const switching = sessionApi.recover(`rf_${'a'.repeat(64)}`);
  expect(fetch.mock.calls.some(([path]) => path === '/api/sessions/recover')).toBe(false);
  initialization.resolve(json({ ready: true }));
  await vi.waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === '/api/sessions/recover')).toBe(true),
  );
  const next = authenticated(() => request('/new-collection', schema));
  expect(fetch.mock.calls.some(([path]) => path === '/api/new-collection')).toBe(false);
  recovered.resolve(json({ ready: true }));
  await switching;
  await next;
  oldRead.resolve(json({ error: { code: 'SESSION_REQUIRED', message: 'Expired' } }, 401));
  await expect(previous).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
  expect(fetch.mock.calls.filter(([path]) => path === '/api/sessions')).toHaveLength(1);
});
