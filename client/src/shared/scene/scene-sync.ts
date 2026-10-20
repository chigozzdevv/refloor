import { create } from 'zustand';
import { fingerprintBuilding } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import type { ProjectSummary } from '@refloor/scene/contracts';
import { ProjectApiError } from '@/shared/refloor/client';
import { projectApi } from '@/shared/refloor/houses';
import { parseProjectFile } from '@/shared/scene/files';
import { useProject } from '@/shared/scene/scene-store';
import type { EditMemory } from '@refloor/scene/edit-memory';
import { fingerprintEditMemory } from '@refloor/scene/edit-memory';

type PendingSave = {
  id: string;
  epoch: number;
  projectId: string | null;
  version: number;
  building: Building;
  memory: EditMemory;
  asNew: boolean;
};
type SavedState = {
  items: ProjectSummary[];
  cursor: string | null;
  loading: boolean;
  saving: boolean;
  opening: boolean;
  error: string | null;
  listError: string | null;
  conflict: boolean;
  refresh: (more?: boolean) => Promise<void>;
  save: (asNew?: boolean, quiet?: boolean) => Promise<void>;
  preserve: () => Promise<boolean>;
  open: (id: string) => Promise<boolean>;
};
let pending: PendingSave | null = null;
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Saved spaces could not complete the request.';

export const useSavedProjects = create<SavedState>((set, get) => ({
  items: [],
  cursor: null,
  loading: false,
  saving: false,
  opening: false,
  error: null,
  listError: null,
  conflict: false,
  refresh: async (more = false) => {
    if (get().loading) return;
    set({ loading: true, listError: null });
    try {
      const page = await projectApi.list(more ? (get().cursor ?? undefined) : undefined);
      set((state) => ({
        items: more
          ? [...new Map([...state.items, ...page.items].map((item) => [item.id, item])).values()]
          : page.items,
        cursor: page.nextCursor,
      }));
    } catch (error) {
      set({ listError: message(error) });
    } finally {
      set({ loading: false });
    }
  },
  save: async (asNew = false, quiet = false) => {
    if (get().saving || get().opening) return;
    const current = useProject.getState();
    if (!pending || pending.epoch !== current.projectEpoch || pending.asNew !== asNew)
      pending = {
        id: crypto.randomUUID(),
        epoch: current.projectEpoch,
        projectId: asNew ? null : (current.remote?.id ?? null),
        version: current.remote?.version ?? 0,
        building: current.compiled.building,
        memory: current.memory,
        asNew,
      };
    const submitted = pending;
    set({ saving: true, error: null, conflict: false });
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
          });
      if (pending === submitted) pending = null;
      const state = useProject.getState();
      if (state.projectEpoch !== submitted.epoch) return;
      const newer = result.project.version > result.acceptedVersion;
      useProject.setState({
        remote: {
          id: result.project.id,
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
      const conflict =
        error instanceof ProjectApiError &&
        ['VERSION_CONFLICT', 'REVISION_CONFLICT'].includes(error.code);
      set({ error: message(error), conflict });
      if (error instanceof ProjectApiError && !error.retryable) pending = null;
    } finally {
      set({ saving: false });
    }
  },
  preserve: async () => {
    const state = useProject.getState();
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
    if (get().saving || get().opening) return false;
    const before = useProject.getState();
    set({ opening: true, error: null });
    try {
      const project = await projectApi.get(id);
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
      set({ conflict: false });
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    } finally {
      set({ opening: false });
    }
  },
}));

let syncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCloudSave() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const state = useProject.getState(),
      saved = useSavedProjects.getState();
    if (
      !state.remote ||
      state.chatPending ||
      state.recovery ||
      saved.saving ||
      saved.opening ||
      saved.conflict ||
      saved.error
    )
      return;
    if (
      state.remote.savedFingerprint !== fingerprintBuilding(state.compiled.building) ||
      state.remote.savedMemoryFingerprint !== fingerprintEditMemory(state.memory)
    )
      void saved.save(false, true);
  }, 2000);
}
const unsubscribeScene = useProject.subscribe((state, previous) => {
  if (
    state.remote !== previous.remote ||
    state.compiled.building !== previous.compiled.building ||
    state.memory !== previous.memory ||
    state.chatPending !== previous.chatPending
  )
    scheduleCloudSave();
});
const unsubscribeSync = useSavedProjects.subscribe((state, previous) => {
  if ((previous.saving && !state.saving) || (previous.opening && !state.opening))
    scheduleCloudSave();
});
if (typeof window !== 'undefined') scheduleCloudSave();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(syncTimer);
    unsubscribeScene();
    unsubscribeSync();
  });
