import { mergeActivity } from '@/shared/collaboration/history';
import { mergeConversation } from '@/shared/collaboration/conversation';
import { SharedOutbox } from '@/shared/collaboration/outbox';
import { io } from 'socket.io-client';
import { z } from 'zod';
import { fingerprintBuilding } from '@refloor/scene';
import type { NavigationPoint } from '@refloor/engine';
import type { EditDetails } from '@/shared/editor/history';
import type { Building } from '@refloor/scene';
import { createEditGuards } from '@refloor/scene/edit-guards';
import {
  isNavigationEdit,
  sharedEditSchema,
  sharedPresenceSchema,
} from '@refloor/scene/collaboration';
import type { SharedEdit, SharedState } from '@refloor/scene/collaboration';
import { createEditMemory, fingerprintEditMemory } from '@refloor/scene/edit-memory';
import { propertiesMatch } from '@refloor/scene/properties';
import { compileBuilding } from '@refloor/engine';
import { canSwingAroundPlayers } from '@refloor/engine/validation/shared-players';
import { useProject } from '@/shared/scene/scene-store';
import { editDocument } from '@/shared/editor/document';
import type { DocumentState } from '@/shared/editor/document';
import { collaborationApi } from '@/shared/collaboration/api';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { collaborationClientId, useCollaboration } from '@/shared/collaboration/store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { ProjectApiError } from '@/shared/refloor/client';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { invalidateShadows } from '@/shared/scene/shadow-updates';

export function remoteShared(state: SharedState) {
  const project = state.project,
    memory = project.memory ?? createEditMemory(project.building);
  return {
    id: project.id,
    buildingId: project.building.id,
    version: project.version,
    shared: true,
    savedFingerprint: fingerprintBuilding(project.building),
    savedMemoryFingerprint: fingerprintEditMemory(memory),
    updatedAt: project.updatedAt,
  };
}
export function openShared(state: SharedState) {
  useProject
    .getState()
    .loadProject(
      compileBuilding(state.project.building),
      remoteShared(state),
      state.project.memory,
    );
  useCollaboration.setState({ state, error: null });
}
const explanation = (error: unknown) =>
  error instanceof Error ? error.message : 'This shared edit could not be completed.';
export function startCollaboration(projectId: string) {
  let closed = false,
    sending = false,
    refreshing = false,
    refreshAgain = false,
    retry: ReturnType<typeof setTimeout> | undefined;
  let canonical: SharedState | null = null,
    queue: SharedEdit[] = [],
    outbox: SharedOutbox | null = null;
  let recoveryError: string | null = null;
  let historyPending: Promise<void> | null = null;
  let resetHistory = true;
  const waiting = new Map<
    string,
    { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }
  >();
  const owns = () => !closed && useProject.getState().remote?.id === projectId;
  const updateQueue = () => {
    useCollaboration.setState({
      pending: queue.length + (historyPending ? 1 : 0),
      ...(recoveryError ? { error: recoveryError } : {}),
    });
  };
  const discard = (ids: string[]) => {
    if (!ids.length) return;
    try {
      outbox?.remove(ids);
      recoveryError = null;
    } catch {
      recoveryError = 'The change was saved, but this browser could not clear its recovery entry.';
    }
  };
  const receipt = (id: string) => {
    let result = waiting.get(id);
    if (!result) {
      let resolve!: () => void, reject!: (error: Error) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      void promise.catch(() => undefined);
      result = { promise, resolve, reject };
      waiting.set(id, result);
    }
    return result;
  };
  const reject = (id: string, error: unknown) => {
    receipt(id).reject(new Error(explanation(error)));
    useProject.getState().notify(explanation(error));
    useCollaboration.setState({ error: explanation(error) });
  };
  function apply(state: SharedState, acceptedId?: string) {
    if (!owns()) return;
    if (canonical && state.project.version < canonical.project.version) state = canonical;
    canonical = state;
    if (!outbox) {
      const saved = new SharedOutbox(projectId, state.self.id);
      try {
        queue = saved.load();
      } catch (cause) {
        throw new Error('Pending changes could not be restored from this browser.', { cause });
      }
      outbox = saved;
    }
    const accepted = queue.filter(
      (edit) => edit.id === acceptedId || state.activity.some((event) => event.id === edit.id),
    );
    discard(accepted.map((edit) => edit.id));
    queue = queue.filter((edit) => !accepted.includes(edit));
    let document: DocumentState = {
      compiled: compileBuilding(state.project.building),
      memory: mergeConversation(
        state.project.memory ?? createEditMemory(state.project.building),
        useProject.getState().memory,
        state.self.id,
      ),
      past: [],
      future: [],
    };
    for (const edit of queue) {
      if (!propertiesMatch(document.compiled.building, edit.guards)) continue;
      try {
        document = editDocument(document, edit.commands, undefined, {
          id: edit.id,
          at: edit.at,
          label: edit.label,
          source: edit.source,
        });
      } catch {
        /* The server reports any conflicting request without replacing newer edits. */
      }
    }
    const currentCompiled = useProject.getState().compiled;
    if (
      currentCompiled.building.revision === document.compiled.building.revision &&
      fingerprintBuilding(currentCompiled.building) ===
        fingerprintBuilding(document.compiled.building)
    )
      document.compiled = currentCompiled;
    const selection = useProject.getState().selection;
    useProject.setState({
      ...document,
      remote: remoteShared(state),
      ...(selection?.kind === 'object' &&
      !document.compiled.building.objects.some((item) => item.id === selection.id)
        ? { selection: null }
        : {}),
    });
    useCollaboration.setState((current) => ({
      state: {
        ...state,
        activity: mergeActivity(
          !resetHistory && current.state?.project.id === projectId ? current.state.activity : [],
          state.activity,
        ),
      },
      error: recoveryError,
    }));
    resetHistory = false;
    updateQueue();
    invalidateShadows();
    for (const edit of accepted) receipt(edit.id).resolve();
  }
  async function refresh() {
    if (!owns()) return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      do {
        refreshAgain = false;
        apply(await collaborationApi.state(projectId));
      } while (owns() && refreshAgain);
      return true;
    } catch (error) {
      if (!owns()) return;
      const denied =
        error instanceof ProjectApiError && ['SHARING_DENIED', 'VIEW_ONLY'].includes(error.code);
      useCollaboration.setState({
        status: denied ? 'denied' : 'offline',
        error: explanation(error),
      });
      if (denied) {
        useProject.getState().notify('Your access to this shared house was removed.');
        socket.disconnect();
        useNavigation.getState().stop();
      }
    } finally {
      refreshing = false;
    }
  }
  async function pump() {
    if (sending || !owns() || !queue.length || useCollaboration.getState().status !== 'live')
      return;
    sending = true;
    const next = queue[0]!;
    try {
      const result = await collaborationApi.edit(projectId, next);
      if (owns()) {
        apply(result.state, result.eventId);
        receipt(next.id).resolve();
      }
    } catch (error) {
      if (!owns() || !queue.some((edit) => edit.id === next.id)) return;
      if (error instanceof ProjectApiError && error.retryable) {
        useCollaboration.setState({
          status: 'offline',
          error: 'Reconnecting. Your pending changes are kept in this browser.',
        });
        retry = setTimeout(() => {
          if (owns())
            void refresh().then((ready) => {
              if (ready && canonical)
                useCollaboration.setState({ status: socket.connected ? 'live' : 'offline' });
              void pump();
            });
        }, 2000);
      } else {
        discard([next.id]);
        queue = queue.filter((edit) => edit.id !== next.id);
        updateQueue();
        if (canonical) apply(canonical);
        reject(next.id, error);
        await refresh();
      }
    } finally {
      sending = false;
      if (owns() && useCollaboration.getState().status === 'live') void pump();
    }
  }
  const bridge = {
    assertEdit: (commands: Parameters<typeof createEditGuards>[1], details?: EditDetails) => {
      const state = useCollaboration.getState();
      if (!owns() || state.status !== 'live' || !canonical)
        throw new Error('Reconnect to the shared house before making a change.');
      const navigation = isNavigationEdit(commands, details?.source);
      if (canonical.self.role === 'viewer' && !navigation)
        throw new Error(
          'You have view access. Ask the owner for editor access to change the house.',
        );
      if (historyPending)
        throw new Error('Let the history change finish before making another edit.');
      if (queue.length >= 100)
        throw new Error('Let the pending changes finish before making more edits.');
    },
    enqueue: (
      before: Building,
      commands: Parameters<typeof createEditGuards>[1],
      id: string,
      at: string,
      player: NavigationPoint | undefined,
      details?: EditDetails,
    ) => {
      const edit = sharedEditSchema.parse({
        id,
        at,
        commands,
        guards: createEditGuards(before, commands),
        label: details?.label ?? 'Edit space',
        source: details?.source ?? 'manual',
        ...(details?.chat
          ? {
              target: details.chat.target,
              message: details.chat.message,
              reply: details.chat.reply,
            }
          : {}),
        player: player ?? null,
      });
      try {
        outbox!.add(edit);
      } catch (cause) {
        throw new Error(
          'Browser storage could not keep this pending change. Free some space and try again.',
          { cause },
        );
      }
      queue.push(edit);
      receipt(id);
      updateQueue();
      queueMicrotask(() => void pump());
    },
    wait: (id: string) => receipt(id).promise,
    flush: async () => {
      if (!queue.length && !historyPending) return true;
      try {
        await Promise.race([
          Promise.all([
            ...queue.map((edit) => receipt(edit.id).promise),
            ...(historyPending ? [historyPending] : []),
          ]),
          new Promise<never>((_, rejectTimeout) =>
            setTimeout(
              () =>
                rejectTimeout(
                  new Error('Wait for shared changes to finish syncing before leaving this house.'),
                ),
              12000,
            ),
          ),
        ]);
        return true;
      } catch (error) {
        useProject.getState().notify(explanation(error));
        return false;
      }
    },
    rollback: (eventId?: string, restore = false) => {
      const event = eventId
        ? (canonical?.activity.find((entry) => entry.id === eventId) ??
          useCollaboration.getState().state?.activity.find((entry) => entry.id === eventId))
        : useCollaboration
            .getState()
            .state?.activity.findLast(
              (entry) =>
                entry.kind === 'edit' &&
                entry.undoable &&
                entry.author.id === canonical?.self.id &&
                Boolean(entry.revertedBy) === restore,
            );
      if (!event || !canonical || canonical.self.role === 'viewer') return;
      if (historyPending || queue.length || useCollaboration.getState().status !== 'live') {
        useProject.getState().notify('Let your pending edits finish before rolling back a change.');
        return;
      }
      const requestId = crypto.randomUUID();
      useCollaboration.setState({ pending: 1 });
      historyPending = collaborationApi
        .rollback(projectId, event.id, requestId, restore)
        .then((result) => {
          apply(result.state);
        })
        .catch((error: unknown) => {
          reject(requestId, error);
          void refresh();
          throw error;
        })
        .finally(() => {
          historyPending = null;
          updateQueue();
        });
      void historyPending.catch(() => undefined);
    },
    canSwing: (id: string, open: boolean) =>
      canSwingAroundPlayers(
        useProject.getState().compiled,
        id,
        open,
        useCollaboration
          .getState()
          .peers.filter((peer) => peer.clientId !== collaborationClientId)
          .flatMap((peer) => (peer.player ? [peer.player] : [])),
      ),
  };
  collaborationBridge.current = bridge;
  useCollaboration.setState({ status: 'connecting', peers: [], error: null, pending: 0 });
  const socket = io({ path: '/api/live', withCredentials: true, autoConnect: false });
  socket.on('connect', () => {
    socket.emit(
      'join',
      { projectId, clientId: collaborationClientId },
      (ack: { ready: boolean; message?: string }) => {
        if (!owns()) return;
        if (!ack.ready) {
          useCollaboration.setState({
            status: 'denied',
            error: ack.message ?? 'This house could not be joined.',
          });
          return;
        }
        void refresh().then(() => {
          if (owns() && socket.connected && useCollaboration.getState().status !== 'denied') {
            useCollaboration.setState({ status: 'live' });
            void pump();
          }
        });
      },
    );
  });
  socket.on('changed', () => {
    void refresh();
  });
  socket.on('presence', (raw: unknown) => {
    const result = z.array(sharedPresenceSchema).max(24).safeParse(raw);
    if (owns() && result.success)
      useCollaboration.setState({
        peers: result.data.filter((peer) => peer.clientId !== collaborationClientId),
      });
  });
  socket.on('disconnect', (reason) => {
    resetHistory = true;
    if (owns()) {
      if (useCollaboration.getState().status === 'denied') {
        useCollaboration.setState({ peers: [] });
        return;
      }
      useCollaboration.setState({ status: 'offline', peers: [] });
      if (reason === 'io server disconnect') void refresh();
    }
  });
  socket.on('connect_error', (error) => {
    if (owns()) useCollaboration.setState({ status: 'offline', error: error.message });
  });
  void refresh().then(() => {
    if (owns() && useCollaboration.getState().status !== 'denied') socket.connect();
  });
  let lastPresence = '',
    lastHeartbeat = 0;
  const presenceTimer = setInterval(() => {
    if (!socket.connected || useCollaboration.getState().status !== 'live') return;
    const state = useProject.getState(),
      draft = useCollaboration.getState().draft;
    const value = {
      selection: state.selection
        ? {
            kind: state.selection.kind,
            id: state.selection.id,
            ...(state.selection.side ? { side: state.selection.side } : {}),
            ...(state.selection.point ? { point: state.selection.point } : {}),
          }
        : (draft?.target ?? null),
      draft: draft?.text ?? '',
      player: state.mode === 'walk' ? (physicsSession.current?.player ?? null) : null,
      floorId: state.floorId,
    };
    const fingerprint = JSON.stringify(value);
    if (fingerprint !== lastPresence || Date.now() - lastHeartbeat > 2000) {
      socket.volatile.emit('presence', value);
      lastPresence = fingerprint;
      lastHeartbeat = Date.now();
    }
  }, 150);
  const recoveryTimer = setInterval(() => {
    if (!owns() || useCollaboration.getState().status !== 'offline') return;
    void refresh().then((ready) => {
      if (!ready || !owns() || useCollaboration.getState().status === 'denied') return;
      if (!socket.connected) socket.connect();
      else {
        useCollaboration.setState({ status: 'live' });
        void pump();
      }
    });
  }, 3000);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (queue.length || historyPending) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    closed = true;
    clearInterval(presenceTimer);
    clearInterval(recoveryTimer);
    clearTimeout(retry);
    socket.disconnect();
    window.removeEventListener('beforeunload', beforeUnload);
    for (const item of waiting.values())
      item.reject(
        new Error('The shared house was closed. Pending changes will retry when it is reopened.'),
      );
    if (collaborationBridge.current === bridge) collaborationBridge.current = null;
    useCollaboration.setState({ status: 'idle', peers: [], pending: 0, draft: null });
  };
}
