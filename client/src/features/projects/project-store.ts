import { create } from 'zustand';
import { createHouse } from '@refloor/blueprints';
import { buildNavigation, compileBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { physicsSession } from '@/runtime/physics/session';
import { entryPose } from '@/runtime/physics/entry';
import type { SceneCommand, SceneRevision } from '@refloor/scene';
import { editDocument, reverseDocument } from '@/runtime/editing/document';
import { findFurniturePlacement } from '@/runtime/editing/placement';
import { editingError } from '@/runtime/editing/errors';
import { draftKey, restoreDraft } from '@/runtime/projects/draft';
import { encodeProject } from '@/runtime/projects/files';

export type ViewMode = 'entry' | 'orbit' | 'walk';
export type Selection = { kind: 'object' | 'wall' | 'floor'; id: string } | null;
type ProjectState = {
  sceneReady: boolean;
  setSceneReady: (ready: boolean) => void;
  compiled: CompiledBuilding;
  projectEpoch: number;
  saveError: string | null;
  recovery: string | null;
  saved: boolean;
  resumeSaving: () => void;
  loadProject: (compiled: CompiledBuilding) => void;
  past: SceneRevision[];
  future: SceneRevision[];
  edit: (commands: SceneCommand[]) => boolean;
  undo: () => void;
  redo: () => void;
  addFurniture: (assetId: string, roomId: string) => boolean;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  focusRequest: { id: string; objectId: string } | null;
  focusObject: (id: string) => void;
  floorId: string;
  mode: ViewMode;
  selection: Selection;
  lighting: 'day' | 'evening';
  quality: 'high' | 'balanced';
  cutaway: boolean;
  interacting: boolean;
  notice: string | null;
  notify: (message: string) => void;
  travelRequest: { id: string; floorId: string } | null;
  setFloor: (id: string) => void;
  setWalkFloor: (id: string) => void;
  select: (selection: Selection) => void;
  setLighting: (lighting: 'day' | 'evening') => void;
  setQuality: (quality: 'high' | 'balanced') => void;
  setMode: (mode: ViewMode) => void;
  setInteracting: (interacting: boolean) => void;
  setDoor: (id: string, open: boolean) => boolean;
  enterHome: () => void;
  createHome: (storeys: 1 | 2, width?: number, depth?: number) => void;
};

const restored = restoreDraft();
const initial =
  restored.compiled ??
  compileBuilding(createHouse({ id: 'linden-house', name: 'The Linden House', storeys: 2 }));
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export const useProject = create<ProjectState>((set, get) => ({
  sceneReady: false,
  setSceneReady: (sceneReady) => set({ sceneReady }),
  compiled: initial,
  projectEpoch: 0,
  saveError: restored.error,
  recovery: restored.recovery,
  saved: !!restored.compiled,
  resumeSaving: () => {
    try {
      localStorage.setItem(draftKey, encodeProject(get().compiled.building));
      set({ recovery: null, saveError: null, saved: true });
    } catch {
      set({
        saveError: 'Browser storage is unavailable. Export your space to keep your changes.',
        saved: false,
      });
    }
  },
  loadProject: (compiled) => {
    set({
      compiled,
      projectEpoch: get().projectEpoch + 1,
      past: [],
      future: [],
      mode: 'entry',
      focusRequest: null,
      floorId: entryPose(compiled).floorId,
      selection: null,
      travelRequest: null,
    });
    get().notify('Project opened. Your room and item identities have been preserved.');
  },
  past: [],
  future: [],
  transformMode: 'translate',
  setTransformMode: (transformMode) => set({ transformMode }),
  focusRequest: null,
  focusObject: (objectId) => {
    const object = get().compiled.building.objects.find((value) => value.id === objectId);
    if (object)
      set({
        mode: 'orbit',
        floorId: object.floorId,
        selection: { kind: 'object', id: objectId },
        focusRequest: { id: crypto.randomUUID(), objectId },
      });
  },
  edit: (commands) => {
    const state = get();
    try {
      set(
        editDocument(
          state,
          commands,
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
        ),
      );
      const selected = get().selection;
      if (
        selected?.kind === 'object' &&
        !get().compiled.building.objects.some((value) => value.id === selected.id)
      )
        set({ selection: null });
      return true;
    } catch (error) {
      state.notify(editingError(error));
      return false;
    }
  },
  undo: () => {
    const state = get();
    try {
      set({
        ...reverseDocument(
          state,
          'undo',
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
        ),
        selection: null,
      });
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Undo is unavailable here.');
    }
  },
  redo: () => {
    const state = get();
    try {
      set({
        ...reverseDocument(
          state,
          'redo',
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
        ),
        selection: null,
      });
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Redo is unavailable here.');
    }
  },
  addFurniture: (assetId, roomId) => {
    const state = get();
    try {
      const object = findFurniturePlacement(
        state.compiled,
        assetId,
        roomId,
        state.mode === 'walk' ? physicsSession.current?.player : undefined,
      );
      if (!state.edit([{ type: 'add-object', object }])) return false;
      set({ selection: { kind: 'object', id: object.id } });
      state.notify('Added to a clear spot. Select it to adjust its position.');
      return true;
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'No clear placement was found.');
      return false;
    }
  },
  floorId: entryPose(initial).floorId,
  mode: 'entry',
  selection: null,
  lighting: 'day',
  quality: 'high',
  cutaway: true,
  interacting: false,
  notice: null,
  travelRequest: null,
  notify: (notice) => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice });
    noticeTimer = setTimeout(() => set({ notice: null }), 5500);
  },
  setFloor: (floorId) => {
    if (get().mode === 'walk') {
      if (get().floorId !== floorId)
        set({ travelRequest: { id: crypto.randomUUID(), floorId }, selection: null });
    } else set({ floorId, mode: 'orbit', selection: null, focusRequest: null });
  },
  setWalkFloor: (floorId) => set({ floorId }),
  select: (selection) => set({ selection }),
  setLighting: (lighting) => set({ lighting }),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) => {
    const state = get();
    if (mode === 'entry') {
      const entry = entryPose(state.compiled);
      physicsSession.current?.teleport(entry.inside);
      set({ floorId: entry.floorId });
    }
    if (mode === 'walk' && state.mode === 'orbit' && physicsSession.current) {
      const navigation = buildNavigation(state.compiled, 'current'),
        floor = state.compiled.building.floors.find((value) => value.id === state.floorId);
      if (floor) {
        const x = floor.footprint.width * 0.35,
          z = floor.footprint.depth * 0.45;
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
    set({ mode, selection: null, travelRequest: null, focusRequest: null });
  },
  setInteracting: (interacting) => set({ interacting }),
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
    if (state.setDoor(entryPose(state.compiled).doorId, true)) state.setMode('walk');
  },
  createHome: (storeys, width, depth) => {
    const options = {
      id: crypto.randomUUID(),
      name: storeys === 2 ? 'The Linden House' : 'The Garden House',
      storeys,
      ...(width === undefined ? {} : { width }),
      ...(depth === undefined ? {} : { depth }),
    };
    set({
      compiled: compileBuilding(createHouse(options)),
      projectEpoch: get().projectEpoch + 1,
      floorId: 'ground',
      mode: 'entry',
      selection: null,
      travelRequest: null,
      focusRequest: null,
      past: [],
      future: [],
    });
  },
}));

const unsubscribeDraft = useProject.subscribe((state, previous) => {
  if (state.compiled.building === previous.compiled.building) return;
  if (state.recovery !== null) {
    useProject.setState({ saved: false });
    return;
  }
  try {
    localStorage.setItem(draftKey, encodeProject(state.compiled.building));
    useProject.setState({ saved: true, saveError: null });
  } catch {
    useProject.setState({
      saved: false,
      saveError: 'Browser storage is unavailable. Export your space to keep your changes.',
    });
  }
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribeDraft);
