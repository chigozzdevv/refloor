import { useState } from 'react';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { planFurnishings } from '@/shared/editor/furnishings-task';
import { physicsSession } from '@/shared/navigation/physics-session';

export function useFurnishings() {
  const [furnishing, setFurnishing] = useState(false);
  const complete = async () => {
    useNavigation.getState().stop();
    const state = useProject.getState();
    setFurnishing(true);
    try {
      const result = await planFurnishings(
        state.compiled,
        state.mode === 'walk' ? physicsSession.current?.player : undefined,
      );
      const current = useProject.getState();
      if (current.compiled !== state.compiled) {
        current.notify('The house changed. Try furnishing again.');
        return;
      }
      if (result.commands.length) {
        if (!current.edit(result.commands, { label: 'Complete room furnishings' })) return;
        current.notify(
          result.skipped
            ? `Updated ${result.commands.length} items. ${result.skipped} need more clear space.`
            : `Updated ${result.commands.length} items. You can undo this in history.`,
        );
      } else
        current.notify(
          result.skipped
            ? 'More clear space is needed for the remaining fittings.'
            : 'Room essentials are already in place.',
        );
    } catch (error) {
      useProject
        .getState()
        .notify(error instanceof Error ? error.message : 'Furnishings could not be completed.');
    } finally {
      setFurnishing(false);
    }
  };
  return { furnishing, complete };
}
