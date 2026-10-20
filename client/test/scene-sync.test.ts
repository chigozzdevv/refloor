import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory, fingerprintEditMemory } from '@refloor/scene/edit-memory';
import type { ProjectList, ProjectWrite } from '@refloor/scene/contracts';
import { projectApi } from '@/shared/refloor/houses';
import { sessionApi } from '@/shared/refloor/sessions';
import { ProjectApiError } from '@/shared/refloor/client';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';

const original = createHouse({ id: 'sync-home', name: 'Sync home', storeys: 1 }),
  date = '2026-10-20T12:00:00.000Z',
  oldId = '7c7ce267-3dba-4e87-a2a7-901aa6d79361',
  newId = 'cd1881eb-b850-4ea4-a489-d632d3209cdc',
  summary = (id: string) => ({
    id,
    name: id === oldId ? 'Old collection' : 'Recovered collection',
    version: 0,
    revision: 0,
    storeys: 1,
    objectCount: original.objects.length,
    createdAt: date,
    updatedAt: date,
    canUndo: false,
    canRedo: false,
  }),
  page = (id: string): ProjectList => ({ items: [summary(id)], nextCursor: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  const compiled = compileBuilding(structuredClone(original)),
    memory = createEditMemory(compiled.building);
  useProject.getState().loadProject(
    compiled,
    {
      id: oldId,
      buildingId: original.id,
      version: 0,
      updatedAt: date,
      savedFingerprint: fingerprintBuilding(compiled.building),
      savedMemoryFingerprint: fingerprintEditMemory(memory),
    },
    memory,
  );
  useSavedProjects.setState({
    items: page(oldId).items,
    cursor: null,
    loading: false,
    saving: false,
    opening: false,
    recovering: false,
    error: null,
    listError: null,
    conflict: false,
    collectionEpoch: useSavedProjects.getState().collectionEpoch + 1,
  });
});
afterEach(() => {
  useProject.setState({ remote: null });
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('collection synchronization boundaries', () => {
  it('ignores an old collection list response after recovery and preserves the local draft', async () => {
    const previous = deferred<ProjectList>(),
      before = fingerprintBuilding(useProject.getState().compiled.building);
    vi.spyOn(projectApi, 'list')
      .mockImplementationOnce(() => previous.promise)
      .mockResolvedValue(page(newId));
    vi.spyOn(sessionApi, 'recover').mockResolvedValue({ ready: true });
    vi.spyOn(projectApi, 'get').mockRejectedValue(
      new ProjectApiError('PROJECT_NOT_FOUND', 'Another collection'),
    );
    const oldList = useSavedProjects.getState().refresh();
    expect(useSavedProjects.getState().loading).toBe(true);
    expect(await useSavedProjects.getState().restoreCollection(`rf_${'a'.repeat(64)}`)).toBe(true);
    expect(useSavedProjects.getState().items.map((item) => item.id)).toEqual([newId]);
    expect(useProject.getState().remote).toBeNull();
    previous.resolve(page(oldId));
    await oldList;
    expect(useSavedProjects.getState().items.map((item) => item.id)).toEqual([newId]);
    expect(fingerprintBuilding(useProject.getState().compiled.building)).toBe(before);
  });

  it('locks saving, opening, preservation and autosave throughout collection recovery', async () => {
    const recovery = deferred<{ ready: true }>(),
      recover = vi.spyOn(sessionApi, 'recover').mockImplementation(() => recovery.promise),
      save = vi.spyOn(projectApi, 'save'),
      create = vi.spyOn(projectApi, 'create'),
      get = vi
        .spyOn(projectApi, 'get')
        .mockRejectedValue(new ProjectApiError('PROJECT_NOT_FOUND', 'Another collection'));
    vi.spyOn(projectApi, 'list').mockResolvedValue(page(newId));
    const state = useProject.getState();
    state.edit([
      {
        type: 'set-roof-material',
        roofId: state.compiled.building.roof.id,
        material: { ...state.compiled.building.roof.material, color: '#123456' },
      },
    ]);
    const restoring = useSavedProjects.getState().restoreCollection(`rf_${'b'.repeat(64)}`);
    expect(useSavedProjects.getState().recovering).toBe(true);
    await useSavedProjects.getState().save();
    expect(await useSavedProjects.getState().open(newId)).toBe(false);
    expect(await useSavedProjects.getState().preserve()).toBe(false);
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledTimes(1);
    recovery.resolve({ ready: true });
    expect(await restoring).toBe(true);
    expect(useSavedProjects.getState().recovering).toBe(false);
    expect(useProject.getState().compiled.building.roof.material.color).toBe('#123456');
  });

  it('drops a failed old-collection retry and saves the newest draft into the recovered collection', async () => {
    const state = useProject.getState();
    state.edit([
      {
        type: 'set-roof-material',
        roofId: state.compiled.building.roof.id,
        material: { ...state.compiled.building.roof.material, color: '#123456' },
      },
    ]);
    const save = vi
      .spyOn(projectApi, 'save')
      .mockRejectedValue(new ProjectApiError('UNAVAILABLE', 'Connection lost', true));
    await useSavedProjects.getState().save();
    expect(save).toHaveBeenCalledTimes(1);
    const changed = useProject.getState();
    changed.edit([
      {
        type: 'set-roof-material',
        roofId: changed.compiled.building.roof.id,
        material: { ...changed.compiled.building.roof.material, color: '#654321' },
      },
    ]);
    vi.spyOn(sessionApi, 'recover').mockResolvedValue({ ready: true });
    vi.spyOn(projectApi, 'get').mockRejectedValue(
      new ProjectApiError('PROJECT_NOT_FOUND', 'Another collection'),
    );
    vi.spyOn(projectApi, 'list').mockResolvedValue(page(newId));
    expect(await useSavedProjects.getState().restoreCollection(`rf_${'c'.repeat(64)}`)).toBe(true);
    const create = vi.spyOn(projectApi, 'create').mockImplementation(
      async (input) =>
        ({
          project: { ...summary(newId), building: input.building, memory: input.memory },
          acceptedVersion: 0,
          replayed: false,
          revision: null,
        }) satisfies ProjectWrite,
    );
    await useSavedProjects.getState().save();
    expect(save).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].building.roof.material.color).toBe('#654321');
    expect(useProject.getState().remote?.id).toBe(newId);
    expect(useSavedProjects.getState().error).toBeNull();
  });

  it('refuses to switch collections while an accepted save response is still pending', async () => {
    const pendingSave = deferred<ProjectWrite>(),
      recover = vi.spyOn(sessionApi, 'recover'),
      state = useProject.getState();
    vi.spyOn(projectApi, 'save').mockImplementation(() => pendingSave.promise);
    vi.spyOn(projectApi, 'list').mockResolvedValue(page(oldId));
    const saving = useSavedProjects.getState().save();
    expect(await useSavedProjects.getState().restoreCollection(`rf_${'d'.repeat(64)}`)).toBe(false);
    expect(recover).not.toHaveBeenCalled();
    pendingSave.resolve({
      project: { ...summary(oldId), building: state.compiled.building, memory: state.memory },
      acceptedVersion: 0,
      replayed: false,
      revision: null,
    });
    await saving;
    expect(useProject.getState().remote?.id).toBe(oldId);
  });
});
