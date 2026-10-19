import { create } from 'zustand';
import { createEditorState } from '@/shared/editor/editor-store';
import type { EditorState } from '@/shared/editor/editor-store';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { physicsSession } from '@/shared/navigation/physics-session';
import { entryPose } from '@/shared/navigation/entry';
import { draftKey, restoreDraft } from '@/shared/scene/draft';
import { encodeDraft } from '@/shared/scene/draft-codec';
import { persistRemoteLink, restoreRemoteLink } from '@/shared/scene/remote';
import type { RemoteLink } from '@/shared/scene/remote';
import { navigationFor } from '@/shared/navigation/destinations';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { restoreEditMemory } from '@/shared/editor/memory';
import type { EditMemory } from '@refloor/scene/edit-memory';
import { clearSceneView, restoreSceneView } from '@/shared/scene/view';

export type ViewMode = 'entry' | 'orbit' | 'walk';
export type ProjectState = EditorState & {
  sceneReady: boolean;
  setSceneReady: (ready: boolean) => void;
  compiled: CompiledBuilding;
  memory: EditMemory;
  projectEpoch: number;
  saveError: string | null;
  recovery: string | null;
  saved: boolean;
  resumeSaving: () => void;
  remote: RemoteLink | null;
  loadProject: (compiled: CompiledBuilding, remote?: RemoteLink, memory?: EditMemory) => void;
  floorId: string;
  mode: ViewMode;
  lighting: 'day' | 'evening';
  quality: 'high' | 'balanced';
  cutaway: boolean;
  notice: string | null;
  notify: (message: string) => void;
  setWalkFloor: (id: string) => void;
  setLighting: (lighting: 'day' | 'evening') => void;
  setQuality: (quality: 'high' | 'balanced') => void;
  setMode: (mode: ViewMode) => void;
  setDoor: (id: string, open: boolean) => boolean;
  enterHome: () => void;
  createHome: (storeys: 1 | 2, width?: number, depth?: number) => void;
};

const restored = restoreDraft();
const initial =
  restored.compiled ??
  compileBuilding(createHouse({ id: 'linden-house', name: 'The Linden House', storeys: 2 }));
const restoredView = restored.compiled ? restoreSceneView(initial) : null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export const useProject = create<ProjectState>((set, get, store) => ({
  sceneReady: false,
  setSceneReady: (sceneReady) => {
    if (sceneReady && get().mode === 'entry') get().setMode('entry');
    set({ sceneReady });
  },
  compiled: initial,
  projectEpoch: 0,
  saveError: restored.error,
  recovery: restored.recovery,
  saved: !!restored.compiled,
  remote: restored.compiled ? restoreRemoteLink(initial.building.id) : null,
  resumeSaving: () => {
    try {
      localStorage.setItem(draftKey, encodeDraft(get()));
      set({ recovery: null, saveError: null, saved: true });
    } catch {
      set({
        saveError: 'Browser storage is unavailable. Export your space to keep your changes.',
        saved: false,
      });
    }
  },
  loadProject: (compiled, remote, memory) => {
    clearSceneView();
    set({
      sceneReady: false,
      compiled,
      memory: restoreEditMemory(compiled.building, memory),
      chatPending: null,
      remote: remote ?? null,
      projectEpoch: get().projectEpoch + 1,
      past: [],
      future: [],
      mode: 'entry',
      focusRequest: null,
      floorId: entryPose(compiled).floorId,
      selection: null,
    });
    get().notify('Space opened.');
  },
  ...createEditorState(set, get, store),
  past: restored.past,
  future: restored.future,
  memory: restored.memory ?? createEditMemory(initial.building),
  floorId: restoredView?.floorId ?? entryPose(initial).floorId,
  mode: restoredView?.mode ?? 'entry',
  lighting: restoredView?.lighting ?? 'evening',
  quality: 'high',
  cutaway: restoredView?.cutaway ?? false,
  notice: restored.historyWarning,
  notify: (notice) => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice });
    noticeTimer = setTimeout(() => set({ notice: null }), 5500);
  },
  setWalkFloor: (floorId) => set({ floorId }),
  setLighting: (lighting) => set({ lighting }),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) => {
    const state = get();
    if (mode === 'entry') {
      const entry = entryPose(state.compiled);
      physicsSession.current?.teleport(entry.inside);
      set({
        mode,
        floorId: entry.floorId,
        selection: null,
        focusRequest: null,
      });
      if (state.compiled.doors.find((door) => door.id === entry.doorId)?.open)
        get().edit([{ type: 'set-door', doorId: entry.doorId, open: false }], {
          source: 'navigation',
          label: 'Close entrance',
        });
      return;
    }
    if (
      mode === 'walk' &&
      state.mode === 'orbit' &&
      physicsSession.current &&
      physicsSession.current.player.floorId !== state.floorId
    ) {
      const navigation = navigationFor(state.compiled, 'current'),
        floor = state.compiled.building.floors.find((value) => value.id === state.floorId);
      if (floor) {
        const x = floor.footprint.x + floor.footprint.width / 2,
          z = floor.footprint.z + floor.footprint.depth / 2;
        const node = navigation.nodes
          .filter((value) => value.floorId === floor.id)
          .sort(
            (a, b) =>
              Math.hypot(a.position.x - x, a.position.z - z) -
              Math.hypot(b.position.x - x, b.position.z - z),
          )[0];
        if (node) physicsSession.current.teleport(node.position);
      }
    }
    set({
      mode,
      selection: null,
      focusRequest: null,
      ...(mode === 'orbit' ? { cutaway: false } : {}),
    });
  },
  setDoor: (id, open) => {
    const state = get(),
      door = state.compiled.doors.find((value) => value.id === id);
    if (!door) {
      state.notify('That door is no longer available.');
      return false;
    }
    if (door.open === open) return true;
    return state.edit([{ type: 'set-door', doorId: id, open }]);
  },
  enterHome: () => {
    const state = get();
    const doorId = entryPose(state.compiled).doorId;
    if (
      state.compiled.doors.find((door) => door.id === doorId)?.open ||
      state.edit([{ type: 'set-door', doorId, open: true }], { source: 'navigation' })
    )
      state.setMode('walk');
  },
  createHome: (storeys, width, depth) => {
    const options = {
      id: crypto.randomUUID(),
      name: storeys === 2 ? 'The Linden House' : 'The Garden House',
      storeys,
      ...(width === undefined ? {} : { width }),
      ...(depth === undefined ? {} : { depth }),
    };
    const compiled = compileBuilding(createHouse(options));
    clearSceneView();
    set({
      compiled,
      sceneReady: false,
      memory: createEditMemory(compiled.building),
      chatPending: null,
      remote: null,
      projectEpoch: get().projectEpoch + 1,
      floorId: 'ground',
      mode: 'entry',
      selection: null,
      focusRequest: null,
      past: [],
      future: [],
    });
  },
}));

const unsubscribeDraft = useProject.subscribe((state, previous) => {
  if (state.remote !== previous.remote) persistRemoteLink(state.remote);
  if (
    state.compiled.building === previous.compiled.building &&
    state.past === previous.past &&
    state.future === previous.future &&
    state.memory === previous.memory
  )
    return;
  if (state.recovery !== null) {
    useProject.setState({ saved: false });
    return;
  }
  try {
    localStorage.setItem(draftKey, encodeDraft(state));
    useProject.setState({ saved: true, saveError: null });
  } catch {
    useProject.setState({
      saved: false,
      saveError: 'Browser storage is unavailable. Export your space to keep your changes.',
    });
  }
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribeDraft);
