import { collaborationBridge } from '@/shared/collaboration/bridge';
import type { StateCreator } from 'zustand';
import type { SceneCommand } from '@refloor/scene';
import type { ProjectState } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { editDocument, restoreBefore, redoChange } from '@/shared/editor/document';
import type { DocumentState } from '@/shared/editor/document';
import type { EditDetails } from '@/shared/editor/history';
import { isUndoable } from '@/shared/editor/history';
import { findFurniturePlacement } from '@/shared/editor/placement';
import { editingError } from '@/shared/editor/errors';
import { recordChatTurn } from '@refloor/scene/edit-memory';
import type { ChatTurn } from '@refloor/scene/edit-memory';
import type { CompiledBuilding } from '@refloor/engine';

function checkDoorSwings(before: CompiledBuilding, after: CompiledBuilding, walking: boolean) {
  const world = walking ? physicsSession.current : null;
  if (!world) return;
  for (const door of after.doors)
    if (
      before.doors.find((value) => value.id === door.id)?.open !== door.open &&
      !world.canSwingDoor(door.id, door.open)
    )
      throw new Error('Step clear of the door so it can swing fully.');
}

export type Selection = {
  kind: 'object' | 'wall' | 'floor' | 'door' | 'roof' | 'surface';
  side?: 'exterior';
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
        cutaway: true,
        floorId: object.floorId,
        selection: { kind: 'object', id: objectId },
        focusRequest: { id: crypto.randomUUID(), objectId },
      });
  },
  edit: (commands, details) => {
    const state = get();
    try {
      if (collaborationBridge.preparing)
        throw new Error('Let sharing finish setting up before editing this house.');
      if (state.remote?.shared) {
        if (!collaborationBridge.current)
          throw new Error('Connect to the shared house before editing.');
        collaborationBridge.current.assertEdit(commands, details);
      }
      const next = editDocument(
        state,
        commands,
        state.mode === 'walk' ? physicsSession.current?.player : undefined,
        details,
      );
      checkDoorSwings(state.compiled, next.compiled, state.mode === 'walk');
      if (state.remote?.shared) {
        for (const door of next.compiled.doors)
          if (
            state.compiled.doors.find((value) => value.id === door.id)?.open !== door.open &&
            !collaborationBridge.current!.canSwing(door.id, door.open)
          )
            throw new Error('Someone is in the doorway. Wait until they move clear.');
        const revision = next.past.at(-1)!.revision;
        collaborationBridge.current!.enqueue(
          state.compiled.building,
          commands,
          revision.id,
          revision.at,
          state.mode === 'walk' ? physicsSession.current?.player : undefined,
          { ...details, label: next.past.at(-1)!.label },
        );
      }
      set(next);
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
    if (get().remote?.shared) {
      collaborationBridge.current?.rollback();
      return;
    }
    const record = get().past.findLast(isUndoable);
    if (record) get().undoTo(record.revision.id);
  },
  undoTo: (id) => {
    if (get().remote?.shared) {
      collaborationBridge.current?.rollback(id);
      return !!collaborationBridge.current;
    }
    const state = get();
    try {
      const next = restoreBefore(
        state,
        id,
        state.mode === 'walk' ? physicsSession.current?.player : undefined,
      );
      checkDoorSwings(state.compiled, next.compiled, state.mode === 'walk');
      set({ ...next, selection: null });
      return true;
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Undo is unavailable here.');
      return false;
    }
  },
  redo: () => {
    if (get().remote?.shared) {
      collaborationBridge.current?.rollback(undefined, true);
      return;
    }
    const state = get();
    try {
      const next = redoChange(
        state,
        state.mode === 'walk' ? physicsSession.current?.player : undefined,
      );
      checkDoorSwings(state.compiled, next.compiled, state.mode === 'walk');
      set({ ...next, selection: null });
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
