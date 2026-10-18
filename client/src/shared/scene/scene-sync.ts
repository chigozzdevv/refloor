import { create } from 'zustand';
import { fingerprintBuilding } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import type { ProjectSummary } from '@refloor/scene/contracts';
import { ProjectApiError } from '@/shared/refloor/client';
import { projectApi } from '@/shared/refloor/houses';
import { parseProjectFile } from '@/shared/scene/files';
import { useProject } from '@/shared/scene/scene-store';

type PendingSave = {
  id: string;
  epoch: number;
  projectId: string | null;
  version: number;
  building: Building;
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
  save: (asNew?: boolean) => Promise<void>;
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
  save: async (asNew = false) => {
    if (get().saving || get().opening) return;
    const current = useProject.getState();
    if (!pending || pending.epoch !== current.projectEpoch || pending.asNew !== asNew)
      pending = {
        id: crypto.randomUUID(),
        epoch: current.projectEpoch,
        projectId: asNew ? null : (current.remote?.id ?? null),
        version: current.remote?.version ?? 0,
        building: current.compiled.building,
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
          })
        : await projectApi.create({ requestId: submitted.id, building: submitted.building });
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
      await get().refresh();
      if (newer)
        set({
          conflict: true,
          error:
            'Your save was accepted, but a newer version is now available. Open the latest saved version or save a new copy.',
        });
      else
        state.notify(
          fingerprintBuilding(state.compiled.building) === fingerprintBuilding(submitted.building)
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
        current.compiled.building !== before.compiled.building
      )
        throw new Error(
          'Your current space changed while loading. Open the saved space again when ready.',
        );
      current.loadProject(compiled, {
        id: project.id,
        buildingId: project.building.id,
        version: project.version,
        savedFingerprint: fingerprintBuilding(project.building),
        updatedAt: project.updatedAt,
      });
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
