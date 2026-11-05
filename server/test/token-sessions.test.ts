import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io } from 'socket.io-client';
import { createHouse } from '@refloor/catalogue/houses';
import { createApp } from '@refloor/server/app';

const origin = 'https://refloor.web.app';
let replica: MongoMemoryReplSet, app: Awaited<ReturnType<typeof createApp>>, url: string;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  app = await createApp(
    {
      production: true,
      host: '127.0.0.1',
      port: 0,
      mongoUri: replica.getUri(),
      database: 'token_sessions',
      clientOrigins: [origin],
    },
    false,
  );
  url = await app.listen({ host: '127.0.0.1', port: 0 });
}, 60000);
afterAll(async () => {
  await app?.close();
  await replica?.stop();
}, 30000);

async function session() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { origin, 'x-refloor-session': 'token' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.cookies).toHaveLength(0);
  expect(response.json().token).toMatch(/^[a-f0-9]{64}$/);
  return { origin, authorization: `Bearer ${response.json().token}` };
}

it('supports credential-free cross-origin requests, renewal and collection recovery', async () => {
  const headers = await session();
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers,
    payload: {
      requestId: randomUUID(),
      building: createHouse({ id: 'token-house', name: 'Token house', storeys: 1 }),
    },
  });
  expect(created.statusCode).toBe(201);
  const renewed = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { ...headers, 'x-refloor-session': 'token' },
  });
  expect(`Bearer ${renewed.json().token}`).toBe(headers.authorization);
  const recovery = await app.inject({ method: 'POST', url: '/api/sessions/recovery', headers });
  expect(recovery.statusCode).toBe(200);
  const recovered = await app.inject({
    method: 'POST',
    url: '/api/sessions/recover',
    headers: { origin, 'x-refloor-session': 'token' },
    payload: { key: recovery.json().key },
  });
  expect(recovered.statusCode).toBe(200);
  expect(recovered.cookies).toHaveLength(0);
  expect(`Bearer ${recovered.json().token}`).not.toBe(headers.authorization);
  const listed = await app.inject({
    url: '/api/projects',
    headers: { origin, authorization: `Bearer ${recovered.json().token}` },
  });
  expect(listed.statusCode).toBe(200);
  expect(listed.json().items.map((item: { id: string }) => item.id)).toContain(
    created.json().project.id,
  );
});

it('retains secure cookie sessions and rejects invalid tokens and foreign origins', async () => {
  const cookie = await app.inject({ method: 'POST', url: '/api/sessions', headers: { origin } });
  expect(cookie.json()).toEqual({ ready: true });
  expect(cookie.cookies[0]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
  expect(
    (
      await app.inject({
        url: '/api/projects',
        headers: { origin, authorization: `Bearer ${'0'.repeat(64)}` },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { origin: 'https://foreign.example', 'x-refloor-session': 'token' },
      })
    ).statusCode,
  ).toBe(403);
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/projects',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,x-refloor-session',
    },
  });
  expect(preflight.headers['access-control-allow-origin']).toBe(origin);
  expect(preflight.headers['access-control-allow-headers']).toContain('authorization');
});

it('authenticates live collaboration without cookies and rejects an invalid socket token', async () => {
  const headers = await session(),
    created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers,
      payload: {
        requestId: randomUUID(),
        building: createHouse({ id: 'live-token', name: 'Live token', storeys: 1 }),
      },
    }),
    projectId = created.json().project.id as string;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/collaboration/projects/${projectId}/enable`,
        headers,
        payload: { name: 'Owner', expectedVersion: 0 },
      })
    ).statusCode,
  ).toBe(200);
  const socket = io(url, {
    path: '/api/live',
    transports: ['websocket'],
    auth: { session: headers.authorization.slice(7) },
    extraHeaders: { Origin: origin },
    autoConnect: false,
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    const joined = await socket
      .timeout(5000)
      .emitWithAck('join', { projectId, clientId: randomUUID() });
    expect(joined).toEqual({ ready: true });
  } finally {
    socket.disconnect();
  }
  const invalid = io(url, {
    path: '/api/live',
    transports: ['websocket'],
    auth: { session: '0'.repeat(64) },
    extraHeaders: { Origin: origin },
    autoConnect: false,
    reconnection: false,
  });
  try {
    const message = await new Promise<string>((resolve, reject) => {
      invalid.once('connect_error', (error) => resolve(error.message));
      invalid.once('connect', () => reject(new Error('Invalid token accepted')));
      invalid.connect();
    });
    expect(message).toContain('session');
  } finally {
    invalid.disconnect();
  }
});
