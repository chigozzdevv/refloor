import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createHouse } from '@refloor/catalogue/houses';
import { fingerprintBuilding } from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import { projectListSchema, projectSchema, projectWriteSchema } from '@refloor/scene/contracts';
import type { ProjectWrite } from '@refloor/scene/contracts';
import { createApp } from '@refloor/server/app';
import type { ServerConfig } from '@refloor/server/shared/config/env';

describe('MongoDB project API', () => {
  let replica: MongoMemoryReplSet;
  let database: MongoClient;
  let app: Awaited<ReturnType<typeof createApp>>;
  let config: ServerConfig;
  const building = createHouse({ id: 'test-house', name: 'Saved home', storeys: 2 });

  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    config = {
      production: false,
      host: '127.0.0.1',
      port: 3001,
      mongoUri: replica.getUri(),
      database: 'refloor_test',
      clientOrigins: ['http://localhost:5173'],
    };
    database = await new MongoClient(config.mongoUri).connect();
    app = await createApp(config, false);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
    await replica?.stop();
  }, 30000);

  async function session() {
    const response = await app.inject({ method: 'POST', url: '/api/sessions' });
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies[0];
    if (!cookie) throw new Error('Session cookie missing');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    return { refloor_session: cookie.value };
  }

  async function create(cookies: Awaited<ReturnType<typeof session>>, requestId = randomUUID()) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies,
      payload: { requestId, building },
    });
    expect(response.statusCode).toBe(201);
    return projectWriteSchema.parse(response.json());
  }

  async function edit(
    cookies: Awaited<ReturnType<typeof session>>,
    current: ProjectWrite,
    commands: SceneCommand[],
    id = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/projects/${current.project.id}/edits`,
      cookies,
      payload: {
        edit: {
          id,
          at: new Date().toISOString(),
          expectedRevision: current.project.revision,
          commands,
        },
        player: null,
      },
    });
  }

  function paint(color: string): SceneCommand {
    const wall = building.floors[0]!.walls[0]!;
    return { type: 'set-wall-material', wallId: wall.id, material: { ...wall.material, color } };
  }

  it('reports readiness and requires a session for private projects', async () => {
    const health = await app.inject('/api/health');
    expect(health.json()).toEqual({ ready: true });
    expect(health.headers['cache-control']).toBe('no-store');
    expect((await app.inject('/api/projects')).statusCode).toBe(401);
  });

  it('stores token hashes and reuses an unexpired browser session', async () => {
    const cookies = await session();
    const response = await app.inject({ method: 'POST', url: '/api/sessions', cookies });
    expect(response.cookies).toHaveLength(0);
    const records = await database.db(config.database).collection('sessions').find().toArray();
    expect(records.some((record) => String(record._id) === cookies.refloor_session)).toBe(false);
    expect(records.length).toBeGreaterThan(0);
    expect(
      (await database.db(config.database).collection('sessions').indexes()).some(
        (index) => index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
  });

  it('creates, lists and loads the complete editable building', async () => {
    const cookies = await session(),
      created = await create(cookies);
    expect(created.project.building).toEqual(building);
    const list = projectListSchema.parse(
      (await app.inject({ url: '/api/projects', cookies })).json(),
    );
    expect(list.items.map((item) => item.id)).toEqual([created.project.id]);
    const loaded = projectSchema.parse(
      (await app.inject({ url: `/api/projects/${created.project.id}`, cookies })).json(),
    );
    expect(loaded).toEqual(created.project);
    const stored = await database
      .db(config.database)
      .collection('projects')
      .findOne({ ownerId: { $exists: true }, creationId: { $exists: true } });
    expect(stored).not.toBeNull();
  });

  it('isolates projects, edit routes and history between browser sessions', async () => {
    const owner = await session(),
      visitor = await session(),
      created = await create(owner);
    expect(
      projectListSchema.parse((await app.inject({ url: '/api/projects', cookies: visitor })).json())
        .items,
    ).toEqual([]);
    expect(
      (await app.inject({ url: `/api/projects/${created.project.id}`, cookies: visitor }))
        .statusCode,
    ).toBe(404);
    expect((await edit(visitor, created, [paint('#123456')])).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${created.project.id}/undo`,
          cookies: visitor,
          payload: {
            id: randomUUID(),
            at: new Date().toISOString(),
            expectedRevision: building.revision,
            player: null,
          },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('rejects expired sessions even before MongoDB TTL removes their records', async () => {
    const cookies = await session();
    await database
      .db(config.database)
      .collection('sessions')
      .updateMany({ expiresAt: { $gt: new Date() } }, { $set: { expiresAt: new Date(0) } });
    expect((await app.inject({ url: '/api/projects', cookies })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/sessions', cookies })).cookies,
    ).toHaveLength(1);
  });

  it('replays project creation without creating duplicate projects', async () => {
    const cookies = await session(),
      requestId = randomUUID(),
      created = await create(cookies, requestId);
    const repeated = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies,
      payload: { requestId, building },
    });
    expect(repeated.statusCode).toBe(200);
    expect(projectWriteSchema.parse(repeated.json())).toMatchObject({
      project: { id: created.project.id },
      replayed: true,
      acceptedVersion: 0,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          cookies,
          payload: { requestId, building: { ...building, name: 'Different' } },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      projectListSchema.parse((await app.inject({ url: '/api/projects', cookies })).json()).items,
    ).toHaveLength(1);
  });

  it('allows only one of two concurrent snapshot saves and persists its receipt atomically', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const changes = ['First writer', 'Second writer'].map((name) => ({
      requestId: randomUUID(),
      expectedVersion: 0,
      building: { ...building, name },
    }));
    const responses = await Promise.all(
      changes.map((payload) =>
        app.inject({ method: 'PUT', url: `/api/projects/${created.project.id}`, cookies, payload }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((response) => response.statusCode === 200);
    const saved = projectWriteSchema.parse(responses[winner]!.json());
    expect(saved.project.version).toBe(1);
    expect(saved.project.revision).toBe(building.revision + 1);
    expect(saved.project.building.objects.map((object) => object.id)).toEqual(
      building.objects.map((object) => object.id),
    );
    const repeated = await app.inject({
      method: 'PUT',
      url: `/api/projects/${created.project.id}`,
      cookies,
      payload: changes[winner]!,
    });
    expect(projectWriteSchema.parse(repeated.json())).toMatchObject({
      acceptedVersion: 1,
      replayed: true,
    });
    expect(
      await database
        .db(config.database)
        .collection('project_revisions')
        .countDocuments({ projectId: created.project.id }),
    ).toBe(1);
  });

  it('keeps a request receipt stable after subsequent edits and rejects payload reuse', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const payload = {
      edit: {
        id: randomUUID(),
        at: new Date().toISOString(),
        expectedRevision: building.revision,
        commands: [paint('#123456')],
      },
      player: null,
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/projects/${created.project.id}/edits`,
      cookies,
      payload,
    });
    expect(first.statusCode).toBe(200);
    const changed = projectWriteSchema.parse(first.json());
    expect((await edit(cookies, changed, [paint('#654321')])).statusCode).toBe(200);
    const repeated = await app.inject({
      method: 'POST',
      url: `/api/projects/${created.project.id}/edits`,
      cookies,
      payload,
    });
    expect(projectWriteSchema.parse(repeated.json())).toMatchObject({
      acceptedVersion: 1,
      replayed: true,
      project: { version: 2 },
    });
    const reused = await app.inject({
      method: 'POST',
      url: `/api/projects/${created.project.id}/edits`,
      cookies,
      payload: { ...payload, edit: { ...payload.edit, commands: [paint('#ffffff')] } },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rolls back a colliding edit without changing the project or history', async () => {
    const cookies = await session(),
      created = await create(cookies),
      sofa = building.objects.find((object) => object.kind === 'sofa')!;
    const rejected = await edit(cookies, created, [
      paint('#123456'),
      { type: 'add-object', object: { ...sofa, id: 'overlapping-sofa' } },
    ]);
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error.code).toBe('INVALID_BUILDING');
    expect(
      projectSchema.parse(
        (await app.inject({ url: `/api/projects/${created.project.id}`, cookies })).json(),
      ),
    ).toEqual(created.project);
    expect(
      await database
        .db(config.database)
        .collection('project_revisions')
        .countDocuments({ projectId: created.project.id }),
    ).toBe(0);
  });

  it('validates player support before accepting edits', async () => {
    const cookies = await session(),
      created = await create(cookies),
      sofa = building.objects.find((object) => object.kind === 'sofa')!;
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${created.project.id}/edits`,
      cookies,
      payload: {
        edit: {
          id: randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: building.revision,
          commands: [paint('#123456')],
        },
        player: { floorId: sofa.floorId, position: sofa.position },
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.issues).toContainEqual(
      expect.objectContaining({ code: 'PLAYER_BLOCKED' }),
    );
  });

  it('persists television and light actions as actual scene state', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const tv = building.objects.find((object) => object.kind === 'television')!,
      light = building.objects.find((object) => object.kind === 'light')!;
    const response = await edit(cookies, created, [
      { type: 'set-television', objectId: tv.id, state: { powered: true, volume: 0.7 } },
      { type: 'set-light', objectId: light.id, state: { powered: false } },
    ]);
    expect(response.statusCode).toBe(200);
    const saved = projectWriteSchema.parse(response.json());
    expect(
      saved.project.building.objects.find((object) => object.id === tv.id)?.behaviours,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'television',
        state: expect.objectContaining({ powered: true, volume: 0.7 }),
      }),
    );
    expect(
      saved.project.building.objects.find((object) => object.id === light.id)?.behaviours,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'light',
        state: expect.objectContaining({ powered: false }),
      }),
    );
  });

  it('restores undo and redo history after restarting the API', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const first = projectWriteSchema.parse(
      (await edit(cookies, created, [paint('#123456')])).json(),
    );
    const second = projectWriteSchema.parse(
      (await edit(cookies, first, [paint('#654321')])).json(),
    );
    await app.close();
    app = await createApp(config, false);
    let current = second;
    for (const kind of ['undo', 'undo', 'redo', 'redo'] as const) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${created.project.id}/${kind}`,
        cookies,
        payload: {
          id: randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: current.project.revision,
          player: null,
        },
      });
      expect(response.statusCode).toBe(200);
      const next = projectWriteSchema.parse(response.json());
      expect(next.project.revision).toBe(current.project.revision + 1);
      current = next;
      if (current.project.version === 4)
        expect(fingerprintBuilding(current.project.building)).toBe(fingerprintBuilding(building));
    }
    expect(fingerprintBuilding(current.project.building)).toBe(
      fingerprintBuilding(second.project.building),
    );
    expect(current.project).toMatchObject({ canUndo: true, canRedo: false, version: 6 });
  });

  it('drops redo after a new edit and rejects stale edits without mutation', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const first = projectWriteSchema.parse(
      (await edit(cookies, created, [paint('#123456')])).json(),
    );
    const undone = projectWriteSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${created.project.id}/undo`,
          cookies,
          payload: {
            id: randomUUID(),
            at: new Date().toISOString(),
            expectedRevision: first.project.revision,
            player: null,
          },
        })
      ).json(),
    );
    expect(undone.project.canRedo).toBe(true);
    const changed = projectWriteSchema.parse(
      (await edit(cookies, undone, [paint('#ffffff')])).json(),
    );
    expect(changed.project.canRedo).toBe(false);
    expect((await edit(cookies, first, [paint('#000000')])).statusCode).toBe(409);
    expect(
      projectSchema.parse(
        (await app.inject({ url: `/api/projects/${created.project.id}`, cookies })).json(),
      ),
    ).toEqual(changed.project);
  });

  it('rejects unsupported assets and snapshots with a different building identity', async () => {
    const cookies = await session(),
      created = await create(cookies);
    const unsupported = structuredClone(building);
    unsupported.objects[0]!.assetId = 'missing/asset';
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/projects/${created.project.id}`,
          cookies,
          payload: { requestId: randomUUID(), expectedVersion: 0, building: unsupported },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/projects/${created.project.id}`,
          cookies,
          payload: {
            requestId: randomUUID(),
            expectedVersion: 0,
            building: { ...building, id: 'another-house' },
          },
        })
      ).json().error.code,
    ).toBe('SCENE_MISMATCH');
  });

  it('paginates only the owning session and rejects malformed cursors', async () => {
    const cookies = await session();
    const created = await Promise.all([create(cookies), create(cookies), create(cookies)]);
    const first = projectListSchema.parse(
      (await app.inject({ url: '/api/projects?limit=2', cookies })).json(),
    );
    expect(first.items).toHaveLength(2);
    const second = projectListSchema.parse(
      (
        await app.inject({ url: `/api/projects?limit=2&cursor=${first.nextCursor}`, cookies })
      ).json(),
    );
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toEqual(
      new Set(created.map((item) => item.project.id)),
    );
    expect(second.nextCursor).toBeNull();
    expect((await app.inject({ url: '/api/projects?cursor=invalid', cookies })).statusCode).toBe(
      400,
    );
    expect((await app.inject({ url: '/api/projects?limit=999', cookies })).statusCode).toBe(400);
  });

  it('rejects cross-origin writes, oversized bodies and malformed input', async () => {
    const cookies = await session();
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies,
      headers: { origin: 'https://other.example' },
      payload: { requestId: randomUUID(), building },
    });
    expect(rejected.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          cookies,
          payload: { requestId: randomUUID(), building: {} },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          cookies,
          payload: { padding: 'x'.repeat(2 * 1024 * 1024) },
        })
      ).statusCode,
    ).toBe(413);
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/projects',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
  });
});
