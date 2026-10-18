import type { StateCreator } from 'zustand';
import type { SceneCommand } from '@refloor/scene';
import type { ProjectState } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { editDocument, restoreBefore, redoChange } from '@/shared/editor/document';
import type { DocumentState } from '@/shared/editor/document';
import type { EditDetails } from '@/shared/editor/history';
import { findFurniturePlacement } from '@/shared/editor/placement';
import { editingError } from '@/shared/editor/errors';
import { recordChatTurn } from '@refloor/scene/edit-memory';
import type { ChatTurn } from '@refloor/scene/edit-memory';

export type Selection = {
  kind: 'object' | 'wall' | 'floor' | 'door';
  id: string;
  point?: { x: number; y: number; z: number };
} | null;
export type EditorState = Omit<DocumentState, 'compiled' | 'memory'> & {
  chatPending: string | null;
  beginChat: (id: string) => boolean;
  finishChat: (id: string, turn?: ChatTurn) => void;
  edit: (commands: SceneCommand[], details?: EditDetails) => boolean;
  undo: () => void;
  undoTo: (id: string) => boolean;
  redo: () => void;
  addFurniture: (assetId: string, roomId: string) => boolean;
  focusRequest: { id: string; objectId: string } | null;
  focusObject: (id: string) => void;
  selection: Selection;
  interacting: boolean;
  select: (selection: Selection) => void;
  setInteracting: (interacting: boolean) => void;
};

export const createEditorState: StateCreator<ProjectState, [], [], EditorState> = (set, get) => ({
  chatPending: null,
  beginChat: (id) => {
    if (get().chatPending) return false;
    set({ chatPending: id });
    return true;
  },
  finishChat: (id, turn) => {
    if (get().chatPending !== id) return;
    set({ chatPending: null, ...(turn ? { memory: recordChatTurn(get().memory, turn) } : {}) });
  },
  past: [],
  future: [],
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
  edit: (commands, details) => {
    const state = get();
    try {
      set(
        editDocument(
          state,
          commands,
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
          details,
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
    const record = get().past.findLast((value) => value.source !== 'navigation');
    if (record) get().undoTo(record.revision.id);
  },
  undoTo: (id) => {
    const state = get();
    try {
      set({
        ...restoreBefore(
          state,
          id,
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
        ),
        selection: null,
      });
      return true;
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Undo is unavailable here.');
      return false;
    }
  },
  redo: () => {
    const state = get();
    try {
      set({
        ...redoChange(state, state.mode === 'walk' ? physicsSession.current?.player : undefined),
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
