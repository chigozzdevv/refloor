import { useEffect, useRef, useState } from 'react';
import { Check, Download, FolderOpen, Upload, X } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import {
  downloadText,
  encodeProject,
  maxProjectBytes,
  readProjectFile,
} from '@/shared/scene/files';
import { editingError } from '@/shared/editor/errors';
import { SavedSpaces } from '@/components/editor/saved-spaces';

export function ProjectActions() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    input = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const { compiled, memory, saved, saveError, recovery, resumeSaving, loadProject, notify } =
    useProject();
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
        if (event.target instanceof Node && !panel.current?.contains(event.target)) setOpen(false);
      },
      key = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setOpen(false);
      };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <div className="project-actions" ref={panel}>
      <button
        className="project-button"
        title="Project files"
        aria-label="Project files"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FolderOpen size={17} />
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Import project file"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            if (file.size > maxProjectBytes)
              throw new Error('Project files must be smaller than 2 MB.');
            const result = readProjectFile(await file.text());
            loadProject(result.compiled, undefined, result.memory);
            setOpen(false);
          } catch (error) {
            notify(`Could not open this project. ${editingError(error)}`);
          } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
          }
        }}
      />
      {open && (
        <section className="project-menu" aria-label="Project files menu">
          <div className="panel-heading">
            <span>Files</span>
            <button
              className="icon-button"
              aria-label="Close project files"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <h2>{compiled.building.name}</h2>
          <span className="draft-state">
            <Check size={12} />
            {saved ? 'Draft saved in this browser' : 'Browser-local draft'}
          </span>
          <SavedSpaces />
          <p>Export a project to keep a copy or open it on another device.</p>
          <button
            className="file-action"
            onClick={() =>
              downloadText(
                encodeProject(compiled.building, memory),
                `${compiled.building.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.refloor.json`,
              )
            }
          >
            <Download size={16} />
            <span>
              Export project<small>Editable rooms, furniture and device settings</small>
            </span>
          </button>
          <button className="file-action" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={16} />
            <span>
              {busy ? 'Checking project…' : 'Open project'}
              <small>Import a Refloor JSON file</small>
            </span>
          </button>
          {saveError && (
            <div className="save-error" role="status">
              <p>{saveError}</p>
              {recovery && (
                <>
                  <button
                    className="button compact outline"
                    onClick={() => downloadText(recovery, 'refloor-draft-recovery.json')}
                  >
                    Download recovery copy
                  </button>
                  <button className="button compact outline" onClick={resumeSaving}>
                    Save current space instead
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
