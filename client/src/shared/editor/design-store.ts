import type { StateCreator } from 'zustand';
import type { ProjectState } from '@/shared/scene/scene-store';
import type { DocumentState } from '@/shared/editor/document';
import {
  removeDesign,
  returnToWorking,
  saveDesign,
  viewDesign,
} from '@/shared/editor/design-checkpoints';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { entryPose } from '@/shared/navigation/entry';
import { resetWalkInput } from '@/shared/navigation/input';
import { invalidateShadows } from '@/shared/scene/shadow-updates';

export type DesignState = {
  saveDesign: (name: string) => boolean;
  viewDesign: (id: string) => boolean;
  returnToWorking: () => boolean;
  removeDesign: (id: string) => boolean;
};

export const createDesignState: StateCreator<ProjectState, [], [], DesignState> = (set, get) => {
  const apply = (create: () => { document: DocumentState; message: string }, switching = false) => {
    const state = get();
    if (state.remote?.shared) {
      state.notify(
        'Save a private copy to compare whole-house designs. Shared history can restore individual edits.',
      );
      return false;
    }
    if (state.chatPending) {
      state.notify('Let the current request finish before changing saved designs.');
      return false;
    }
    try {
      const world = state.mode === 'walk' ? physicsSession.current : null;
      if (switching && state.mode === 'walk' && (!world || world.compiled !== state.compiled))
        throw new Error(
          'Wait for the walking controls to finish loading before switching designs.',
        );
      const result = create();
      if (switching && world)
        for (const door of result.document.compiled.doors)
          if (
            state.compiled.doors.find((item) => item.id === door.id)?.open !== door.open &&
            !world.canSwingDoor(door.id, door.open)
          )
            throw new Error('Step clear of the doorway before switching designs.');
      if (switching) {
        useNavigation.getState().stop();
        resetWalkInput();
      }
      set({
        ...result.document,
        ...(switching
          ? {
              selection: null,
              focusRequest: null,
              floorId: result.document.compiled.building.floors.some(
                (floor) => floor.id === state.floorId,
              )
                ? state.floorId
                : entryPose(result.document.compiled).floorId,
            }
          : {}),
      });
      if (switching) invalidateShadows();
      state.notify(result.message);
      return true;
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'This design could not be opened.');
      return false;
    }
  };
  const player = () => (get().mode === 'walk' ? physicsSession.current?.player : undefined);
  return {
    saveDesign: (name) =>
      apply(() => ({ document: saveDesign(get(), name), message: 'Design saved.' })),
    viewDesign: (id) =>
      apply(() => {
        const result = viewDesign(get(), id, player()),
          name = get().memory.designs!.items.find((item) => item.id === id)!.name;
        return {
          ...result,
          message: result.preserved
            ? `Viewing ${name}. Your edits were saved as ${result.preserved}.`
            : `Viewing ${name}. Your working design is preserved.`,
        };
      }, true),
    returnToWorking: () =>
      apply(() => {
        const result = returnToWorking(get(), player());
        return {
          ...result,
          message: result.preserved
            ? `Working design restored. Your edits were saved as ${result.preserved}.`
            : 'Working design and undo history restored.',
        };
      }, true),
    removeDesign: (id) =>
      apply(() => ({ document: removeDesign(get(), id), message: 'Saved design removed.' })),
  };
};
