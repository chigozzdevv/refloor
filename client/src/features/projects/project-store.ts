import { create } from 'zustand';
import { createHouse } from '@refloor/blueprints';
import { compileBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';

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
  setFloor: (id: string) => void;
  select: (selection: Selection) => void;
  setLighting: (lighting: 'day' | 'evening') => void;
  setQuality: (quality: 'high' | 'balanced') => void;
  setMode: (mode: ViewMode) => void;
  setInteracting: (interacting: boolean) => void;
  createHome: (storeys: 1 | 2, width?: number, depth?: number) => void;
};

const initial = compileBuilding(
  createHouse({ id: 'linden-house', name: 'The Linden House', storeys: 2 }),
);

export const useProject = create<ProjectState>((set) => ({
  sceneReady: false,
  setSceneReady: (sceneReady) => set({ sceneReady }),
  compiled: initial,
  floorId: 'ground',
  mode: 'orbit',
  selection: null,
  lighting: 'day',
  quality: 'high',
  cutaway: true,
  interacting: false,
  setFloor: (floorId) => set({ floorId, mode: 'orbit', selection: null }),
  select: (selection) => set({ selection }),
  setLighting: (lighting) => set({ lighting }),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) => set({ mode, selection: null }),
  setInteracting: (interacting) => set({ interacting }),
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
      mode: 'orbit',
      selection: null,
    });
  },
}));
