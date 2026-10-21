import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createHouse } from '@refloor/catalogue/houses';
import { createEditGuards } from '@refloor/scene/edit-guards';
import type { SceneCommand } from '@refloor/scene';
import { buildNavigation, validateBuilding, isPlayerPositionValid } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { sharedStateSchema, sharedReceiptSchema } from '@refloor/scene/collaboration';
import type { SharedState } from '@refloor/scene/collaboration';
import { createApp } from '@refloor/server/app';

describe('durable house collaboration', () => {
  let replica: MongoMemoryReplSet, app: Awaited<ReturnType<typeof createApp>>, url: string;
  const sockets: Socket[] = [];
  const addresses = new WeakMap<object, string>();
  let nextAddress = 2;
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    app = await createApp(
      {
        production: false,
        host: '127.0.0.1',
        port: 0,
        mongoUri: replica.getUri(),
        database: 'collaboration',
        clientOrigins: ['http://127.0.0.1:4173'],
      },
      false,
    );
    url = await app.listen({ host: '127.0.0.1', port: 0 });
  }, 60000);
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app?.close();
    await replica?.stop();
  }, 30000);
  async function browser() {
    const remoteAddress = `127.0.0.${nextAddress++}`;
    const response = await app.inject({ method: 'POST', url: '/api/sessions', remoteAddress });
    const cookies = { refloor_session: response.cookies[0]!.value };
    addresses.set(cookies, remoteAddress);
    return cookies;
  }
  type Cookies = Awaited<ReturnType<typeof browser>>;
  const post = (cookies: Cookies, path: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: path,
      cookies,
      payload: payload as object,
      remoteAddress: addresses.get(cookies) ?? '127.0.0.1',
    });
  async function setup() {
    const owner = await browser(),
      editor = await browser(),
      viewer = await browser(),
      building = createHouse({ id: randomUUID(), name: 'Shared home', storeys: 1 });
    const created = await post(owner, '/api/projects', { requestId: randomUUID(), building });
    const id = created.json().project.id as string,
      base = `/api/collaboration/projects/${id}`;
    expect(
      (
        await post(owner, `${base}/enable`, {
          name: 'Owner',
          expectedVersion: created.json().project.version,
        })
      ).statusCode,
    ).toBe(200);
    const invitation = (await post(owner, `${base}/invites`, { role: 'editor' })).json();
    const joined = await post(editor, '/api/collaboration/join', {
      token: invitation.token,
      name: 'Ada',
    });
    expect(joined.statusCode).toBe(200);
    const viewInvite = (await post(owner, `${base}/invites`, { role: 'viewer' })).json();
    await post(viewer, '/api/collaboration/join', { token: viewInvite.token, name: 'Bola' });
    const state = sharedStateSchema.parse((await app.inject({ url: base, cookies: owner })).json());
    return { owner, editor, viewer, id, base, state };
  }
  function edit(state: SharedState, commands: SceneCommand[]) {
    return {
      id: randomUUID(),
      at: new Date().toISOString(),
      commands,
      guards: createEditGuards(state.project.building, commands),
      label: 'Change finish',
      source: 'manual',
      player: null,
    };
  }
  const roof = (color: string, state: SharedState): SceneCommand => ({
    type: 'set-roof-material',
    roofId: state.project.building.roof.id,
    material: { ...state.project.building.roof.material, color },
  });
  it('merges independent stale edits, rejects same-property conflicts, and replays request IDs exactly once', async () => {
    const { owner, editor, base, state } = await setup();
    const a = edit(state, [roof('#123456', state)]),
      room = state.project.building.floors[0]!.rooms[0]!;
    const b = edit(state, [
      {
        type: 'set-room-floor-material',
        roomId: room.id,
        material: { ...room.floorMaterial, color: '#345678' },
      },
    ]);
    const [first, second] = await Promise.all([
      post(owner, `${base}/edits`, a),
      post(editor, `${base}/edits`, b),
    ]);
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    const again = sharedReceiptSchema.parse((await post(owner, `${base}/edits`, a)).json());
    expect(again.replayed).toBe(true);
    expect(again.state.activity).toHaveLength(2);
    expect(again.state.project.building.roof.material.color).toBe('#123456');
    expect(again.state.project.building.floors[0]!.rooms[0]!.floorMaterial.color).toBe('#345678');
    expect(
      (await post(editor, `${base}/edits`, edit(state, [roof('#ffffff', state)]))).statusCode,
    ).toBe(409);
    expect(
      (await post(owner, `${base}/edits`, { ...a, label: 'Different request' })).statusCode,
    ).toBe(409);
  });
  it('rolls back one property without losing another person’s later edits, then restores it', async () => {
    const { owner, editor, base, state } = await setup();
    const a = edit(state, [roof('#123456', state)]);
    await post(owner, `${base}/edits`, a);
    const room = state.project.building.floors[0]!.rooms[0]!;
    await post(
      editor,
      `${base}/edits`,
      edit(state, [
        {
          type: 'set-room-floor-material',
          roomId: room.id,
          material: { ...room.floorMaterial, color: '#345678' },
        },
      ]),
    );
    const rolled = await post(owner, `${base}/activity/${a.id}`, {
      id: randomUUID(),
      at: new Date().toISOString(),
      restore: false,
    });
    expect(rolled.statusCode, rolled.body).toBe(200);
    const result = sharedReceiptSchema.parse(rolled.json()).state;
    expect(result.project.building.roof.material.color).toBe(
      state.project.building.roof.material.color,
    );
    expect(result.project.building.floors[0]!.rooms[0]!.floorMaterial.color).toBe('#345678');
    expect(result.activity.find((event) => event.id === a.id)?.revertedBy).toBeTruthy();
    const restored = await post(editor, `${base}/activity/${a.id}`, {
      id: randomUUID(),
      at: new Date().toISOString(),
      restore: true,
    });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(
      sharedReceiptSchema.parse(restored.json()).state.project.building.roof.material.color,
    ).toBe('#123456');
  });
  it('enforces roles, revocation, private collection isolation, and blocks snapshot overwrites', async () => {
    const { owner, editor, viewer, id, base, state } = await setup();
    const commands = edit(state, [roof('#123456', state)]);
    expect((await post(viewer, `${base}/edits`, commands)).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/projects/${id}`, cookies: editor })).statusCode).toBe(
      404,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/projects/${id}`,
          cookies: owner,
          payload: {
            requestId: randomUUID(),
            expectedVersion: state.project.version,
            building: state.project.building,
          },
        })
      ).statusCode,
    ).toBe(409);
    const editorId = state.members.find((member) => member.name === 'Ada')!.id;
    expect(
      (await post(owner, `${base}/members`, { memberId: editorId, role: 'removed' })).statusCode,
    ).toBe(200);
    expect((await post(editor, `${base}/edits`, commands)).statusCode).toBe(403);
    expect((await app.inject({ url: base, cookies: editor })).statusCode).toBe(403);
  });
  it('delivers presence and accepted changes to a separate live session and resyncs after reconnect', async () => {
    const { owner, editor, id, base, state } = await setup();
    const connect = (cookies: Cookies) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = io(url, {
          path: '/api/live',
          transports: ['websocket'],
          extraHeaders: {
            Cookie: `refloor_session=${cookies.refloor_session}`,
            Origin: 'http://127.0.0.1:4173',
          },
        });
        sockets.push(socket);
        socket.once('connect_error', reject);
        socket.once('connect', () =>
          socket.emit(
            'join',
            { projectId: id, clientId: randomUUID() },
            (ack: { ready: boolean }) =>
              ack.ready ? resolve(socket) : reject(new Error('Join failed')),
          ),
        );
      });
    const first = await connect(owner),
      second = await connect(editor);
    const presence = new Promise<unknown[]>((resolve) => first.once('presence', resolve));
    second.emit('presence', {
      selection: { kind: 'roof', id: state.project.building.roof.id },
      draft: 'Make the roof blue',
      phase: 'typing',
      player: null,
      floorId: 'ground',
    });
    expect(await presence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ draft: 'Make the roof blue', phase: 'typing' }),
      ]),
    );
    const applying = new Promise<unknown[]>((resolve) => first.once('presence', resolve));
    second.emit('presence', {
      selection: { kind: 'house', id: state.project.building.id },
      draft: 'Make the roof blue',
      phase: 'applying',
      player: null,
      floorId: 'ground',
    });
    expect(await applying).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'applying',
          selection: { kind: 'house', id: state.project.building.id },
        }),
      ]),
    );
    const changed = new Promise<void>((resolve) => second.once('changed', resolve));
    await post(owner, `${base}/edits`, edit(state, [roof('#123456', state)]));
    await changed;
    second.disconnect();
    const latest = sharedStateSchema.parse(
      (await app.inject({ url: base, cookies: owner })).json(),
    );
    await post(owner, `${base}/edits`, edit(latest, [roof('#345678', latest)]));
    await connect(editor);
    const recovered = sharedStateSchema.parse(
      (await app.inject({ url: base, cookies: editor })).json(),
    );
    expect(recovered.activity).toHaveLength(2);
    expect(recovered.project.building.roof.material.color).toBe('#345678');
  }, 20000);
  it('rejects a rollback after a later writer changes the same property', async () => {
    const { owner, editor, base, state } = await setup();
    const first = edit(state, [roof('#123456', state)]);
    const accepted = sharedReceiptSchema.parse((await post(owner, `${base}/edits`, first)).json());
    await post(editor, `${base}/edits`, edit(accepted.state, [roof('#abcdef', accepted.state)]));
    const response = await post(owner, `${base}/activity/${first.id}`, {
      id: randomUUID(),
      at: new Date().toISOString(),
      restore: false,
    });
    expect(response.statusCode).toBe(409);
    const latest = sharedStateSchema.parse(
      (await app.inject({ url: base, cookies: owner })).json(),
    );
    expect(latest.project.building.roof.material.color).toBe('#abcdef');
  });
  it('validates navigation permissions, guard coverage and internal history commands', async () => {
    const { owner, viewer, base, state } = await setup();
    const door = state.project.building.floors
      .flatMap((floor) => floor.walls)
      .flatMap((wall) => wall.openings)
      .find((opening) => opening.kind === 'door')!;
    const navigation = {
      ...edit(state, [{ type: 'set-door', doorId: door.id, open: true }]),
      source: 'navigation',
    };
    expect((await post(viewer, `${base}/edits`, navigation)).statusCode).toBe(200);
    expect(
      (
        await post(viewer, `${base}/edits`, {
          ...edit(state, [roof('#ffffff', state)]),
          source: 'navigation',
        })
      ).statusCode,
    ).toBe(403);
    const unguarded = edit(state, [roof('#ffffff', state)]);
    expect(
      (
        await post(owner, `${base}/edits`, {
          ...unguarded,
          guards: [{ path: ['name'], value: { exists: true, value: state.project.name } }],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post(owner, `${base}/edits`, {
          ...unguarded,
          commands: [
            {
              type: 'restore-properties',
              changes: [{ path: ['name'], value: { exists: true, value: 'Forged' } }],
            },
          ],
        })
      ).statusCode,
    ).toBe(400);
  });
  it('revokes invitation tokens, keeps accepted members scoped to one house, and lists shared houses for guests', async () => {
    const { owner, editor, id, base } = await setup();
    const invitation = (await post(owner, `${base}/invites`, { role: 'editor' })).json();
    expect((await post(owner, `${base}/invites/${invitation.id}/revoke`, {})).statusCode).toBe(200);
    const links = await app.inject({ url: `${base}/invites`, cookies: owner });
    expect(links.statusCode).toBe(200);
    expect(links.body).not.toContain(invitation.token);
    expect(links.json().items.some((item: { id: string }) => item.id === invitation.id)).toBe(
      false,
    );
    expect((await app.inject({ url: `${base}/invites`, cookies: editor })).statusCode).toBe(403);
    const stranger = await browser();
    expect(
      (
        await post(stranger, '/api/collaboration/join', {
          token: invitation.token,
          name: 'Visitor',
        })
      ).statusCode,
    ).toBe(410);
    const shared = await app.inject({ url: '/api/collaboration/projects', cookies: editor });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().items.map((project: { id: string }) => project.id)).toContain(id);
    expect((await app.inject({ url: base, cookies: stranger })).statusCode).toBe(403);
  });
  it('blocks forged Viewer action events while allowing genuine room arrival and door actions', async () => {
    const { owner, viewer, base, state } = await setup();
    const light = state.project.building.objects.find((object) =>
      object.behaviours.some((value) => value.kind === 'light'),
    )!;
    const powered = light.behaviours.find((value) => value.kind === 'light')!.state.powered;
    const room = state.project.building.floors[0]!.rooms[0]!;
    const installed = sharedReceiptSchema.parse(
      (
        await post(
          owner,
          `${base}/edits`,
          edit(state, [
            {
              type: 'set-rules',
              rules: [
                {
                  id: 'click-light',
                  label: 'Click light',
                  enabled: true,
                  trigger: { kind: 'object-click', objectId: light.id },
                  conditions: [],
                  actions: [
                    { type: 'set-light', objectId: light.id, state: { powered: !powered } },
                  ],
                },
                {
                  id: 'arrival-light',
                  label: 'Arrival light',
                  enabled: true,
                  trigger: { kind: 'room-enter', roomId: room.id },
                  conditions: [],
                  actions: [
                    { type: 'set-light', objectId: light.id, state: { powered: !powered } },
                  ],
                },
              ],
            },
          ]),
        )
      ).json(),
    ).state;
    for (const event of [
      { kind: 'object-click' as const, objectId: light.id },
      { kind: 'power' as const, objectId: light.id, powered: true },
    ]) {
      const response = await post(viewer, `${base}/edits`, {
        ...edit(installed, [{ type: 'emit-event', event }]),
        source: 'navigation',
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    const arrival = {
      ...edit(installed, [{ type: 'emit-event', event: { kind: 'room-enter', roomId: room.id } }]),
      source: 'navigation',
    };
    expect((await post(viewer, `${base}/edits`, arrival)).statusCode).toBe(403);
    const compiled = validateBuilding(installed.project.building);
    const node = buildNavigation(compiled).nodes.find(
      (node) =>
        contains(room.footprint, node.position) &&
        isPlayerPositionValid(compiled, { floorId: node.floorId, position: node.position }),
    )!;
    const response = await post(viewer, `${base}/edits`, {
      ...arrival,
      id: randomUUID(),
      player: { floorId: node.floorId, position: node.position },
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = sharedReceiptSchema.parse(response.json());
    expect(
      result.state.project.building.objects
        .find((object) => object.id === light.id)!
        .behaviours.find((value) => value.kind === 'light')!.state.powered,
    ).toBe(!powered);
  });
  it('rolls back saved action effects together without firing those actions again', async () => {
    const { owner, editor, base, state } = await setup();
    const light = state.project.building.objects.find((object) =>
      object.behaviours.some((value) => value.kind === 'light'),
    )!;
    const door = state.project.building.floors
      .flatMap((floor) => floor.walls)
      .flatMap((wall) => wall.openings)
      .find((opening) => opening.kind === 'door')!;
    const rules = edit(state, [
      {
        type: 'set-rules',
        rules: [
          {
            id: 'entry-light',
            label: 'Entry light',
            enabled: true,
            trigger: { kind: 'door', doorId: door.id, open: true },
            conditions: [],
            actions: [{ type: 'set-light', objectId: light.id, state: { powered: false } }],
          },
        ],
      },
    ]);
    const prepared = sharedReceiptSchema.parse(
      (await post(owner, `${base}/edits`, rules)).json(),
    ).state;
    const command = edit(prepared, [{ type: 'set-door', doorId: door.id, open: true }]);
    const applied = sharedReceiptSchema.parse(
      (await post(editor, `${base}/edits`, command)).json(),
    ).state;
    expect(
      applied.project.building.objects
        .find((object) => object.id === light.id)!
        .behaviours.find((value) => value.kind === 'light')!.state.powered,
    ).toBe(false);
    const rolled = await post(owner, `${base}/activity/${command.id}`, {
      id: randomUUID(),
      at: new Date().toISOString(),
      restore: false,
    });
    expect(rolled.statusCode, rolled.body).toBe(200);
    expect(
      sharedReceiptSchema
        .parse(rolled.json())
        .state.project.building.objects.find((object) => object.id === light.id)!.behaviours,
    ).toEqual(light.behaviours);
  });
  it('retains the house, permissions and change journal after the API restarts', async () => {
    const { owner, editor, id, base, state } = await setup();
    const response = await post(owner, `${base}/edits`, edit(state, [roof('#123456', state)]));
    expect(response.statusCode).toBe(200);
    for (const socket of sockets) socket.disconnect();
    await app.close();
    app = await createApp(
      {
        production: false,
        host: '127.0.0.1',
        port: 0,
        mongoUri: replica.getUri(),
        database: 'collaboration',
        clientOrigins: ['http://127.0.0.1:4173'],
      },
      false,
    );
    url = await app.listen({ host: '127.0.0.1', port: 0 });
    const recovered = sharedStateSchema.parse(
      (await app.inject({ url: `/api/collaboration/projects/${id}`, cookies: editor })).json(),
    );
    expect(recovered.project.building.roof.material.color).toBe('#123456');
    expect(recovered.activity).toHaveLength(1);
    expect(recovered.self.name).toBe('Ada');
  });
});
