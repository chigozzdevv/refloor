import { useEffect } from 'react';
import { Armchair, Redo2, Undo2 } from 'lucide-react';
import { useProject } from '@/features/projects/project-store';
import { isTyping } from '@/runtime/physics/input';

export function EditorToolbar({ openLibrary }: { openLibrary: () => void }) {
  const { past, future, undo, redo, edit, selection, mode } = useProject();
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
  if (mode === 'entry') return null;
  return (
    <div className="editor-toolbar" aria-label="Editing tools">
      <button className="button primary" onClick={openLibrary}>
        <Armchair size={16} /> Furnish
      </button>
      <span className="toolbar-divider" />
      <button
        className="icon-button"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!past.length}
        onClick={undo}
      >
        <Undo2 size={18} />
      </button>
      <button
        className="icon-button"
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
        disabled={!future.length}
        onClick={redo}
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
}
