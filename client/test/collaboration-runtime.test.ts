import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import type { SharedState } from '@refloor/scene/collaboration';
import { useProject } from '@/shared/scene/scene-store';
import { useCollaboration } from '@/shared/collaboration/store';
import { collaborationApi } from '@/shared/collaboration/api';
import { startCollaboration, remoteShared } from '@/shared/collaboration/runtime';

const transport = vi.hoisted(() => ({
  sockets: [] as { handlers: Map<string, (...args: unknown[]) => void>; connected: boolean }[],
}));
vi.mock('socket.io-client', () => ({
  io: () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      handlers,
      connected: false,
      on: (name: string, callback: (...args: unknown[]) => void) => {
        handlers.set(name, callback);
      },
      connect: () => {
        socket.connected = true;
        handlers.get('connect')?.();
      },
      disconnect: () => {
        socket.connected = false;
        handlers.get('disconnect')?.('io client disconnect');
      },
      emit: (name: string, _payload: unknown, ack?: (reply: { ready: boolean }) => void) => {
        if (name === 'join') ack?.({ ready: true });
      },
      volatile: { emit: () => {} },
    };
    transport.sockets.push(socket);
    return socket;
  },
}));
const initial = useProject.getState();
let snapshot: SharedState;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return saved.size;
    },
    key: (index: number) => [...saved.keys()][index] ?? null,
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  });
  const building = createHouse({ id: 'shared-context-house', name: 'Shared context', storeys: 1 });
  const self = { id: 'owner', name: 'Owner', role: 'owner' as const, color: '#8ec5ff' };
  snapshot = {
    project: {
      id: 'fe5be6b7-4b1a-4d16-90b4-cf53db9731da',
      name: building.name,
      version: 1,
      revision: building.revision,
      storeys: 1,
      objectCount: building.objects.length,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      shared: true,
      canUndo: false,
      canRedo: false,
      building,
      memory: createEditMemory(building),
    },
    self,
    members: [self],
    activity: [],
    hasEarlier: false,
  };
  useCollaboration.setState({
    state: null,
    status: 'idle',
    peers: [],
    pending: 0,
    error: null,
    draft: null,
  });
  useProject
    .getState()
    .loadProject(compileBuilding(building), remoteShared(snapshot), snapshot.project.memory);
  vi.spyOn(collaborationApi, 'state').mockImplementation(async () => structuredClone(snapshot));
});
afterEach(() => {
  stop?.();
  stop = undefined;
  useProject.setState(initial, true);
  useCollaboration.setState({
    state: null,
    status: 'idle',
    peers: [],
    pending: 0,
    error: null,
    draft: null,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  transport.sockets.length = 0;
});

describe('shared browser lifecycle', () => {
  it('preserves local clarification context when another member changes the house and after reconnect', async () => {
    stop = startCollaboration(snapshot.project.id);
    await vi.waitFor(() => expect(useCollaboration.getState().status).toBe('live'));
    const requestId = crypto.randomUUID();
    useProject.getState().beginChat(requestId);
    useProject
      .getState()
      .finishChat(requestId, {
        id: requestId,
        at: new Date().toISOString(),
        target: { kind: 'house', id: snapshot.project.building.id },
        author: { id: snapshot.self.id, name: snapshot.self.name },
        message: 'Change it',
        reply: 'Which item?',
        status: 'clarification',
        baseRevision: snapshot.project.building.revision,
        revisionId: null,
      });
    const socket = transport.sockets[0]!;
    snapshot.project.version++;
    socket.handlers.get('changed')?.();
    await vi.waitFor(() =>
      expect(useProject.getState().remote?.version).toBe(snapshot.project.version),
    );
    expect(useProject.getState().memory.turns.at(-1)?.reply).toBe('Which item?');
    socket.handlers.get('disconnect')?.('transport close');
    socket.handlers.get('connect')?.();
    await vi.waitFor(() => expect(useCollaboration.getState().status).toBe('live'));
    expect(useProject.getState().memory.turns.map((turn) => turn.id)).toEqual([requestId]);
  });
});
