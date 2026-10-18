import { Armchair, Redo2, Undo2 } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function ObjectToolbar({ openLibrary }: { openLibrary: () => void }) {
  const { past, future, undo, redo, mode } = useProject();
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
