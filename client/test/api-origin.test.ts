import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const api = 'https://api.refloor.example',
  token = 'a'.repeat(64),
  recovered = 'b'.repeat(64);
const storage = new Map<string, string>();
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_REFLOOR_API_URL', api);
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('uses the configured API origin and persists the session without cross-site cookies', async () => {
  const fetch = vi.fn(async (path: string) =>
    path.endsWith('/sessions') ? json({ ready: true, token }) : json({ value: 1 }),
  );
  vi.stubGlobal('fetch', fetch);
  const client = await import('@/shared/refloor/client');
  await client.authenticated(() => client.request('/check', z.object({ value: z.number() })));
  expect(fetch.mock.calls[0]?.[0]).toBe(`${api}/api/sessions`);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    `${api}/api/sessions`,
    expect.objectContaining({
      credentials: 'omit',
      headers: expect.objectContaining({ 'X-Refloor-Session': 'token' }),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${api}/api/check`,
    expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }),
  );
  expect(storage.get(`refloor:api-session:${api}`)).toBe(token);
  vi.resetModules();
  expect((await import('@/shared/refloor/endpoint')).apiSessionToken()).toBe(token);
});

it('replaces the live request token after collection recovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ ready: true, token: recovered })),
  );
  const endpoint = await import('@/shared/refloor/endpoint');
  endpoint.rememberApiSession(token);
  const { sessionApi } = await import('@/shared/refloor/sessions');
  await sessionApi.recover(`rf_${'c'.repeat(64)}`);
  expect(endpoint.apiSessionToken()).toBe(recovered);
});

it('rejects a missing production session token and invalid API origins', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ ready: true })),
  );
  const client = await import('@/shared/refloor/client');
  await expect(client.authenticated(() => Promise.resolve())).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  vi.resetModules();
  vi.stubEnv('VITE_REFLOOR_API_URL', `${api}/path`);
  await expect(import('@/shared/refloor/endpoint')).rejects.toThrow('origin');
});
