import { collaborationBridge } from '@/shared/collaboration/bridge';
import { collaborationApi } from '@/shared/collaboration/api';
import { create } from 'zustand';
import { fingerprintBuilding } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import type { ProjectSummary } from '@refloor/scene/contracts';
import { ProjectApiError } from '@/shared/refloor/client';
import { projectApi } from '@/shared/refloor/houses';
import { sessionApi } from '@/shared/refloor/sessions';
import { parseProjectFile } from '@/shared/scene/files';
import { useProject } from '@/shared/scene/scene-store';
import type { EditMemory } from '@refloor/scene/edit-memory';
import { fingerprintEditMemory } from '@refloor/scene/edit-memory';
import { latestCollectionMetadata } from '@/shared/scene/remote';

type PendingSave = {
  id: string;
  epoch: number;
  projectId: string | null;
  version: number;
  building: Building;
  memory: EditMemory;
  asNew: boolean;
  name?: string;
  collectionEpoch: number;
};
type SavedState = {
  items: ProjectSummary[];
  cursor: string | null;
  loading: boolean;
  saving: boolean;
  opening: boolean;
  recovering: boolean;
  retrying: boolean;
  collectionEpoch: number;
  error: string | null;
  saveError: string | null;
  listError: string | null;
  conflict: boolean;
  refresh: (more?: boolean) => Promise<void>;
  save: (asNew?: boolean, quiet?: boolean) => Promise<void>;
  retrySave: () => Promise<void>;
  preserve: () => Promise<boolean>;
  open: (id: string) => Promise<boolean>;
  restoreCollection: (key: string) => Promise<boolean>;
};
let pending: PendingSave | null = null;
let saveFailures = 0;
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Saved spaces could not complete the request.';

export const useSavedProjects = create<SavedState>((set, get) => ({
  items: [],
  cursor: null,
  loading: false,
  saving: false,
  opening: false,
  recovering: false,
  retrying: false,
  collectionEpoch: 0,
  error: null,
  saveError: null,
  listError: null,
  conflict: false,
  refresh: async (more = false) => {
    if (get().loading || get().recovering) return;
    const collection = get().collectionEpoch;
    set({ loading: true, listError: null });
    try {
      const [page, shared] = await Promise.all([
        projectApi.list(more ? (get().cursor ?? undefined) : undefined),
        collaborationApi.list(),
      ]);
      page.items = [
        ...new Map([...page.items, ...shared.items].map((item) => [item.id, item])).values(),
      ];
      if (get().collectionEpoch !== collection) return;
      set((state) => {
        const known = new Map(state.items.map((item) => [item.id, item]));
        const incoming = page.items
          .map((item) => ({
            ...item,
            ...latestCollectionMetadata(item, known.get(item.id), useProject.getState().remote),
          }))
          .filter((item) => !item.deleted);
        return {
          items: more
            ? [...new Map([...state.items, ...incoming].map((item) => [item.id, item])).values()]
            : incoming,
          cursor: page.nextCursor,
        };
      });
      const current = useProject.getState();
      const listed = get().items.find((item) => item.id === current.remote?.id);
      if (
        current.remote &&
        listed &&
        (listed.collectionVersion ?? 0) > (current.remote.collectionVersion ?? 0)
      )
        useProject.setState({
          remote: { ...current.remote, ...latestCollectionMetadata(listed, current.remote) },
        });
    } catch (error) {
      if (get().collectionEpoch === collection) set({ listError: message(error) });
    } finally {
      if (get().collectionEpoch === collection) set({ loading: false });
    }
  },
  save: async (asNew = false, quiet = false) => {
    if (get().saving || get().opening || get().recovering) return;
    if (!asNew && useProject.getState().remote?.shared) {
      await collaborationBridge.current?.flush();
      return;
    }
    const current = useProject.getState(),
      collection = get().collectionEpoch;
    if (
      !pending ||
      pending.epoch !== current.projectEpoch ||
      pending.asNew !== asNew ||
      pending.collectionEpoch !== collection
    )
      pending = {
        id: crypto.randomUUID(),
        epoch: current.projectEpoch,
        projectId: asNew || current.remote?.deleted ? null : (current.remote?.id ?? null),
        version: current.remote?.version ?? 0,
        building: current.compiled.building,
        memory: current.memory,
        asNew,
        ...(current.remote?.name ? { name: current.remote.name } : {}),
        collectionEpoch: collection,
      };
    const submitted = pending;
    set({ saving: true, error: null, saveError: null, conflict: false });
    try {
      const result = submitted.projectId
        ? await projectApi.save(submitted.projectId, {
            requestId: submitted.id,
            expectedVersion: submitted.version,
            building: submitted.building,
            memory: submitted.memory,
          })
        : await projectApi.create({
            requestId: submitted.id,
            building: submitted.building,
            memory: submitted.memory,
            ...(submitted.name ? { name: submitted.name } : {}),
          });
      if (get().collectionEpoch !== collection) return;
      if (pending === submitted) pending = null;
      saveFailures = 0;
      set({ retrying: false });
      const state = useProject.getState();
      if (
        state.projectEpoch !== submitted.epoch ||
        (submitted.projectId !== null &&
          (state.remote?.id !== submitted.projectId || state.remote.deleted))
      )
        return;
      const newer = result.project.version > result.acceptedVersion;
      useProject.setState({
        remote: {
          id: result.project.id,
          ...latestCollectionMetadata(
            result.project,
            state.remote,
            get().items.find((item) => item.id === result.project.id),
          ),
          buildingId: submitted.building.id,
          version: result.acceptedVersion,
          savedFingerprint: fingerprintBuilding(submitted.building),
          savedMemoryFingerprint: fingerprintEditMemory(submitted.memory),
          updatedAt: result.project.updatedAt,
        },
        compiled: {
          ...state.compiled,
          building: {
            ...state.compiled.building,
            revision: Math.max(
              state.compiled.building.revision,
              newer ? submitted.building.revision : result.project.revision,
            ),
          },
        },
      });
      if (!quiet) await get().refresh();
      if (newer)
        set({
          conflict: true,
          error:
            'Your save was accepted, but a newer version is now available. Open the latest saved version or save a new copy.',
          saveError:
            'Your save was accepted, but a newer version is now available. Open the latest saved version or save a new copy.',
        });
      else if (!quiet)
        state.notify(
          fingerprintBuilding(state.compiled.building) ===
            fingerprintBuilding(submitted.building) &&
            fingerprintEditMemory(state.memory) === fingerprintEditMemory(submitted.memory)
            ? 'Space saved.'
            : 'Snapshot saved. You have newer changes to save.',
        );
    } catch (error) {
      if (
        get().collectionEpoch !== collection ||
        useProject.getState().projectEpoch !== submitted.epoch ||
        (submitted.projectId !== null &&
          (useProject.getState().remote?.id !== submitted.projectId ||
            useProject.getState().remote?.deleted))
      )
        return;
      const conflict =
        error instanceof ProjectApiError &&
        ['VERSION_CONFLICT', 'REVISION_CONFLICT'].includes(error.code);
      const retrying = error instanceof ProjectApiError && error.retryable;
      saveFailures = retrying ? saveFailures + 1 : 0;
      set({ error: message(error), saveError: message(error), conflict, retrying });
      if (error instanceof ProjectApiError && !error.retryable) pending = null;
    } finally {
      if (get().collectionEpoch === collection) set({ saving: false });
    }
  },
  retrySave: () => get().save(pending?.asNew ?? false, true),
  preserve: async () => {
    if (get().recovering) {
      set({ error: 'Let collection recovery finish before replacing your current house.' });
      return false;
    }
    const state = useProject.getState();
    if (state.remote?.shared) return (await collaborationBridge.current?.flush()) ?? false;
    if (
      !state.saved &&
      state.projectEpoch === 0 &&
      !state.past.length &&
      !state.memory.turns.length
    )
      return true;
    const saved = () => {
      const current = useProject.getState();
      return (
        current.remote?.savedFingerprint === fingerprintBuilding(current.compiled.building) &&
        current.remote.savedMemoryFingerprint === fingerprintEditMemory(current.memory)
      );
    };
    if (saved()) return true;
    await get().save();
    if (saved()) return true;
    if (!get().error)
      set({ error: 'Your current house must finish saving before starting another.' });
    return false;
  },
  open: async (id) => {
    if (get().saving || get().opening || get().recovering) return false;
    const before = useProject.getState(),
      collection = get().collectionEpoch;
    set({ opening: true, error: null });
    try {
      const project = await projectApi.get(id).catch((error: unknown) => {
        if (error instanceof ProjectApiError && error.code === 'PROJECT_NOT_FOUND')
          return collaborationApi.state(id).then((state) => state.project);
        throw error;
      });
      if (get().collectionEpoch !== collection) return false;
      const compiled = parseProjectFile(JSON.stringify(project.building));
      const current = useProject.getState();
      if (
        current.projectEpoch !== before.projectEpoch ||
        current.compiled.building !== before.compiled.building ||
        current.memory !== before.memory
      )
        throw new Error(
          'Your current space changed while loading. Open the saved space again when ready.',
        );
      current.loadProject(
        compiled,
        {
          id: project.id,
          ...latestCollectionMetadata(
            project,
            current.remote,
            get().items.find((item) => item.id === project.id),
          ),
          ...(project.shared ? { shared: true } : {}),
          buildingId: project.building.id,
          version: project.version,
          savedFingerprint: fingerprintBuilding(project.building),
          savedMemoryFingerprint: project.memory
            ? fingerprintEditMemory(project.memory)
            : undefined,
          updatedAt: project.updatedAt,
        },
        project.memory,
      );
      pending = null;
      saveFailures = 0;
      set({ conflict: false, retrying: false, saveError: null });
      return true;
    } catch (error) {
      if (get().collectionEpoch === collection) set({ error: message(error) });
      return false;
    } finally {
      if (get().collectionEpoch === collection) set({ opening: false });
    }
  },
  restoreCollection: async (key) => {
    if (get().saving || get().opening || get().recovering) {
      set({
        error: 'Let your current project finish saving or opening before restoring a collection.',
      });
      return false;
    }
    const collection = get().collectionEpoch + 1;
    clearTimeout(syncTimer);
    pending = null;
    saveFailures = 0;
    set({
      recovering: true,
      retrying: false,
      collectionEpoch: collection,
      loading: false,
      error: null,
      saveError: null,
      listError: null,
    });
    try {
      await sessionApi.recover(key.trim());
      if (get().collectionEpoch !== collection) return false;
      set({ items: [], cursor: null, conflict: false });
      const state = useProject.getState(),
        remote = state.remote;
      if (remote) {
        try {
          const project = await projectApi.get(remote.id);
          const current = useProject.getState();
          if (
            get().collectionEpoch === collection &&
            current.projectEpoch === state.projectEpoch &&
            current.remote?.id === remote.id
          )
            useProject.setState({
              remote: { ...current.remote, ...latestCollectionMetadata(project, current.remote) },
            });
        } catch (error) {
          if (!(error instanceof ProjectApiError) || error.code !== 'PROJECT_NOT_FOUND')
            throw error;
          const current = useProject.getState();
          if (
            get().collectionEpoch === collection &&
            current.projectEpoch === state.projectEpoch &&
            current.remote?.id === remote.id
          )
            useProject.setState({ remote: null });
        }
      }
      const page = await projectApi.list();
      if (get().collectionEpoch !== collection) return false;
      set({
        items: page.items.map((item) => ({
          ...item,
          ...latestCollectionMetadata(item, useProject.getState().remote),
        })),
        cursor: page.nextCursor,
        error: null,
        listError: null,
      });
      return true;
    } catch (error) {
      if (get().collectionEpoch === collection) set({ error: message(error) });
      return false;
    } finally {
      if (get().collectionEpoch === collection) set({ recovering: false });
    }
  },
}));

let syncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCloudSave(delay?: number) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(
    () => {
      const state = useProject.getState(),
        saved = useSavedProjects.getState();
      if (
        state.remote?.shared ||
        state.chatPending ||
        state.recovery ||
        saved.saving ||
        saved.opening ||
        saved.recovering ||
        saved.conflict
      )
        return;
      if (
        saved.retrying &&
        pending?.epoch === state.projectEpoch &&
        pending.collectionEpoch === saved.collectionEpoch
      ) {
        void saved.save(pending.asNew, true);
        return;
      }
      if (!state.remote || state.remote.deleted || saved.error) return;
      if (
        state.remote.savedFingerprint !== fingerprintBuilding(state.compiled.building) ||
        state.remote.savedMemoryFingerprint !== fingerprintEditMemory(state.memory)
      )
        void saved.save(false, true);
    },
    delay ??
      (useSavedProjects.getState().retrying
        ? Math.min(30000, 2000 * 2 ** Math.min(saveFailures, 4))
        : 2000),
  );
}
const unsubscribeScene = useProject.subscribe((state, previous) => {
  const archived =
    previous.remote &&
    (!state.remote || (!previous.remote.deleted && state.remote.deleted)) &&
    (!pending || pending.projectId === previous.remote.id);
  if (state.projectEpoch !== previous.projectEpoch || archived) {
    pending = null;
    saveFailures = 0;
    useSavedProjects.setState({ retrying: false, saveError: null, error: null, conflict: false });
  }
  if (
    state.remote !== previous.remote ||
    state.compiled.building !== previous.compiled.building ||
    state.memory !== previous.memory ||
    state.chatPending !== previous.chatPending
  )
    scheduleCloudSave();
});
const unsubscribeSync = useSavedProjects.subscribe((state, previous) => {
  if (
    (previous.saving && !state.saving) ||
    (previous.opening && !state.opening) ||
    (previous.recovering && !state.recovering)
  )
    scheduleCloudSave();
});
const reconnectSave = () => scheduleCloudSave(0);
if (typeof window !== 'undefined') {
  scheduleCloudSave();
  window.addEventListener('online', reconnectSave);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(syncTimer);
    unsubscribeScene();
    unsubscribeSync();
    window.removeEventListener('online', reconnectSave);
  });
