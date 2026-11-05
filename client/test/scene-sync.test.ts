import { collaborationApi } from '@/shared/collaboration/api';
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
  vi.spyOn(collaborationApi, 'list').mockResolvedValue({ items: [], nextCursor: null });
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
    retrying: false,
    error: null,
    saveError: null,
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
  it('keeps a completed rename when an older snapshot receipt arrives later', async () => {
    const snapshot = deferred<ProjectWrite>();
    const before = useProject.getState();
    vi.spyOn(projectApi, 'save').mockImplementation(() => snapshot.promise);
    const saving = useSavedProjects.getState().save(false, true);
    useProject.setState({
      remote: { ...before.remote!, name: 'Renamed house', collectionVersion: 1 },
    });
    useSavedProjects.setState({
      items: [{ ...summary(oldId), name: 'Renamed house', collectionVersion: 1 }],
    });
    snapshot.resolve({
      project: {
        ...summary(oldId),
        collectionVersion: 0,
        version: 1,
        building: before.compiled.building,
        memory: before.memory,
      },
      acceptedVersion: 1,
      replayed: false,
      revision: null,
    });
    await saving;
    expect(useProject.getState().remote).toMatchObject({
      name: 'Renamed house',
      collectionVersion: 1,
      version: 1,
    });
  });

  it('merges a delayed list without reversing newer collection metadata', async () => {
    const response = deferred<ProjectList>();
    vi.spyOn(projectApi, 'list').mockImplementation(() => response.promise);
    const refreshing = useSavedProjects.getState().refresh();
    useSavedProjects.setState({
      items: [{ ...summary(oldId), name: 'Renamed house', collectionVersion: 2 }],
    });
    response.resolve({
      items: [{ ...summary(oldId), collectionVersion: 1 }],
      nextCursor: null,
    });
    await refreshing;
    expect(useSavedProjects.getState().items[0]).toMatchObject({
      name: 'Renamed house',
      collectionVersion: 2,
    });
    expect(useProject.getState().remote).toMatchObject({
      name: 'Renamed house',
      collectionVersion: 2,
    });
  });

  it('uses newer listed metadata when opening an older house response', async () => {
    const before = useProject.getState();
    vi.spyOn(projectApi, 'get').mockResolvedValue({
      ...summary(newId),
      collectionVersion: 0,
      building: before.compiled.building,
      memory: before.memory,
    });
    useSavedProjects.setState({
      items: [{ ...summary(newId), name: 'Renamed saved house', collectionVersion: 1 }],
    });
    expect(await useSavedProjects.getState().open(newId)).toBe(true);
    expect(useProject.getState().remote).toMatchObject({
      id: newId,
      name: 'Renamed saved house',
      collectionVersion: 1,
    });
  });

  it('keeps recovered metadata when the following list response is older', async () => {
    const before = useProject.getState();
    vi.spyOn(sessionApi, 'recover').mockResolvedValue({ ready: true });
    vi.spyOn(projectApi, 'get').mockResolvedValue({
      ...summary(oldId),
      name: 'Recovered rename',
      collectionVersion: 2,
      building: before.compiled.building,
      memory: before.memory,
    });
    vi.spyOn(projectApi, 'list').mockResolvedValue({
      items: [{ ...summary(oldId), collectionVersion: 1 }],
      nextCursor: null,
    });
    expect(await useSavedProjects.getState().restoreCollection(`rf_${'e'.repeat(64)}`)).toBe(true);
    expect(useProject.getState().remote).toMatchObject({
      name: 'Recovered rename',
      collectionVersion: 2,
    });
    expect(useSavedProjects.getState().items[0]).toMatchObject({
      name: 'Recovered rename',
      collectionVersion: 2,
    });
  });

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
  it('never snapshot-saves a shared house and waits for its command outbox before replacement', async () => {
    const save = vi.spyOn(projectApi, 'save'),
      current = useProject.getState();
    useProject.setState({ remote: { ...current.remote!, shared: true } });
    await useSavedProjects.getState().save();
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).not.toHaveBeenCalled();
    expect(await useSavedProjects.getState().preserve()).toBe(false);
  });

  it('retries a transient autosave with the same request, then saves edits made while reconnecting', async () => {
    const save = vi.spyOn(projectApi, 'save');
    save.mockRejectedValueOnce(new ProjectApiError('UNAVAILABLE', 'Connection lost', true));
    save.mockImplementation(async (_id, input) => ({
      project: {
        ...summary(oldId),
        version: input.expectedVersion + 1,
        building: input.building,
        memory: input.memory,
      },
      acceptedVersion: input.expectedVersion + 1,
      replayed: false,
      revision: null,
    }));
    const change = (color: string) => {
      const state = useProject.getState();
      state.edit([
        {
          type: 'set-roof-material',
          roofId: state.compiled.building.roof.id,
          material: { ...state.compiled.building.roof.material, color },
        },
      ]);
    };
    change('#123456');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useSavedProjects.getState()).toMatchObject({ retrying: true, error: 'Connection lost' });
    change('#654321');
    await vi.advanceTimersByTimeAsync(4000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1]).toEqual(save.mock.calls[0]![1]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]![1].building.roof.material.color).toBe('#654321');
    expect(save.mock.calls[2]![1].requestId).not.toBe(save.mock.calls[0]![1].requestId);
    expect(useSavedProjects.getState()).toMatchObject({ retrying: false, error: null });
  });

  it('keeps the same copy request when retrying a failed first save', async () => {
    const create = vi.spyOn(projectApi, 'create');
    create.mockRejectedValueOnce(new ProjectApiError('TIMEOUT', 'Took too long', true));
    create.mockImplementation(async (input) => ({
      project: { ...summary(newId), building: input.building, memory: input.memory },
      acceptedVersion: 0,
      replayed: false,
      revision: null,
    }));
    vi.spyOn(projectApi, 'list').mockResolvedValue(page(oldId));
    await useSavedProjects.getState().save(true);
    expect(useSavedProjects.getState().retrying).toBe(true);
    useProject.setState({ remote: null });
    expect(useSavedProjects.getState().retrying).toBe(true);
    await useSavedProjects.getState().retrySave();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0]).toEqual(create.mock.calls[0]![0]);
    expect(useProject.getState().remote?.id).toBe(newId);
    expect(useSavedProjects.getState()).toMatchObject({ retrying: false, error: null });
  });

  it('leaves version conflicts for explicit resolution instead of retrying them', async () => {
    const save = vi
      .spyOn(projectApi, 'save')
      .mockRejectedValue(new ProjectApiError('VERSION_CONFLICT', 'A newer version exists'));
    await useSavedProjects.getState().save(false, true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useSavedProjects.getState()).toMatchObject({ retrying: false, conflict: true });
  });

  it('does not attach a late save failure to a different house', async () => {
    let fail!: (reason: Error) => void;
    const save = vi.spyOn(projectApi, 'save').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const saving = useSavedProjects.getState().save(false, true);
    useProject.getState().createHome(1);
    fail(new ProjectApiError('UNAVAILABLE', 'Old request failed', true));
    await saving;
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useSavedProjects.getState()).toMatchObject({
      retrying: false,
      error: null,
      saveError: null,
      conflict: false,
    });
  });

  it.each(['detached', 'deleted'] as const)('stops retrying a %s remote house', async (change) => {
    const save = vi
      .spyOn(projectApi, 'save')
      .mockRejectedValue(new ProjectApiError('UNAVAILABLE', 'Connection lost', true));
    await useSavedProjects.getState().save(false, true);
    expect(useSavedProjects.getState().retrying).toBe(true);
    useProject.setState({
      remote: change === 'deleted' ? { ...useProject.getState().remote!, deleted: true } : null,
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useSavedProjects.getState()).toMatchObject({
      retrying: false,
      error: null,
      saveError: null,
    });
  });

  it('preserves an unchanged deleted house without recreating it and saves later edits as a copy', async () => {
    const create = vi.spyOn(projectApi, 'create').mockImplementation(async (input) => ({
      project: { ...summary(newId), building: input.building, memory: input.memory },
      acceptedVersion: 0,
      replayed: false,
      revision: null,
    }));
    const save = vi.spyOn(projectApi, 'save');
    vi.spyOn(projectApi, 'list').mockResolvedValue(page(newId));
    useProject.setState({
      remote: { ...useProject.getState().remote!, name: 'My design', deleted: true },
    });
    expect(await useSavedProjects.getState().preserve()).toBe(true);
    expect(create).not.toHaveBeenCalled();
    const state = useProject.getState();
    state.edit([
      {
        type: 'set-roof-material',
        roofId: state.compiled.building.roof.id,
        material: { ...state.compiled.building.roof.material, color: '#123456' },
      },
    ]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await useSavedProjects.getState().preserve()).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].name).toBe('My design');
    expect(useProject.getState().remote).toMatchObject({ id: newId });
    expect(useProject.getState().remote?.deleted).toBeUndefined();
  });
});
