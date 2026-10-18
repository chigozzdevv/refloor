import { create } from 'zustand';
import { createHouse } from '@refloor/blueprints';
import { buildNavigation, compileBuilding, validatePlacement } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { physicsSession } from '@/runtime/physics/session';
import { entryPose } from '@/runtime/physics/entry';

export type ViewMode = 'entry' | 'orbit' | 'walk';
export type Selection = { kind: 'object' | 'wall'; id: string } | null;
type ProjectState = {
  sceneReady: boolean;
  setSceneReady: (ready: boolean) => void;
  compiled: CompiledBuilding;
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

const initial = compileBuilding(
  createHouse({ id: 'linden-house', name: 'The Linden House', storeys: 2 }),
);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export const useProject = create<ProjectState>((set, get) => ({
  sceneReady: false,
  setSceneReady: (sceneReady) => set({ sceneReady }),
  compiled: initial,
  floorId: 'ground',
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
    } else set({ floorId, mode: 'orbit', selection: null });
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
    set({ mode, selection: null, travelRequest: null });
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
    try {
      const player = state.mode === 'walk' ? physicsSession.current?.player : undefined;
      const result = validatePlacement(
        state.compiled.building,
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: state.compiled.building.revision,
          commands: [{ type: 'set-door', doorId: id, open }],
        },
        state.compiled.options,
        player,
      );
      set({ compiled: result.compiled });
      return true;
    } catch (error) {
      state.notify(
        error instanceof Error
          ? error.message
          : 'The door cannot move while the passage is obstructed.',
      );
      return false;
    }
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
      floorId: 'ground',
      mode: 'entry',
      selection: null,
      travelRequest: null,
    });
  },
}));
