import { useEffect } from 'react';
import { useProject } from '@/shared/scene/scene-store';
import { isTyping } from '@/shared/navigation/input';

export function useCommandShortcuts() {
  const { edit, selection } = useProject();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        isTyping(event.target) ||
        (event.target instanceof Element && event.target.closest('[role=dialog]'))
      )
        return;
      const state = useProject.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        state.selection?.kind === 'object'
      ) {
        event.preventDefault();
        state.edit([{ type: 'remove-object', objectId: state.selection.id }]);
      } else if (event.key === 'Escape') state.select(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [edit, selection]);
}
