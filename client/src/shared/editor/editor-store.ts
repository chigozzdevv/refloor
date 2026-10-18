import type { StateCreator } from 'zustand';
import type { SceneCommand, SceneRevision } from '@refloor/scene';
import type { ProjectState } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { editDocument, reverseDocument } from '@/shared/editor/document';
import { findFurniturePlacement } from '@/shared/editor/placement';
import { editingError } from '@/shared/editor/errors';

export type Selection = { kind: 'object' | 'wall' | 'floor'; id: string } | null;
export type EditorState = {
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
  selection: Selection;
  interacting: boolean;
  select: (selection: Selection) => void;
  setInteracting: (interacting: boolean) => void;
};

export const createEditorState: StateCreator<ProjectState, [], [], EditorState> = (set, get) => ({
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
  selection: null,
  interacting: false,
  select: (selection) => set({ selection }),
  setInteracting: (interacting) => set({ interacting }),
});
