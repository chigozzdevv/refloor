import { useRef, useState } from 'react';
import { Check, Copy, Download, Plus, Upload } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import {
  downloadText,
  encodeProject,
  maxProjectBytes,
  readProjectFile,
} from '@/shared/scene/files';
import { editingError } from '@/shared/editor/errors';
import { SavedSpaces } from '@/components/editor/saved-spaces';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { ProjectRecovery } from '@/components/editor/project-recovery';
import { PanelHeading } from '@/components/ui/panel-heading';

export function ProjectActions({
  close,
  back,
  openNewHome,
}: {
  close: () => void;
  back: () => void;
  openNewHome: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { compiled, memory, remote, saved, saveError, recovery, resumeSaving, notify } =
    useProject();
  const syncing = useSavedProjects((state) => state.saving || state.opening || state.recovering);
  const savedName = useSavedProjects(
    (state) => state.items.find((item) => item.id === remote?.id)?.name,
  );
  return (
    <section className="house-menu homes-menu" aria-label="Homes">
      <PanelHeading title="Homes" back={back} close={close} />
      <div className="current-home">
        <h2>{remote?.name ?? savedName ?? compiled.building.name}</h2>
        <span className="draft-state">
          <Check size={12} />
          {saved ? 'Saved locally' : 'Not saved locally'}
        </span>
      </div>
      <button
        className="new-home-action"
        disabled={busy || syncing || organizing}
        onClick={openNewHome}
      >
        <Plus size={17} />
        New house
      </button>
      <SavedSpaces
        opened={close}
        organizing={setOrganizing}
        files={
          <>
            {remote && !remote.deleted && (
              <button
                className="file-action"
                disabled={syncing || organizing}
                onClick={() => void useSavedProjects.getState().save(true)}
              >
                <Copy size={16} />
                Save a copy
              </button>
            )}
            <button
              className="file-action"
              onClick={() =>
                downloadText(
                  encodeProject(compiled.building, memory),
                  `${(remote?.name ?? savedName ?? compiled.building.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.refloor.json`,
                )
              }
            >
              <Download size={16} />
              Export house
            </button>
            <button
              className="file-action"
              disabled={busy || syncing || organizing}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              {busy ? 'Opening…' : 'Import house'}
            </button>
            <ProjectRecovery />
          </>
        }
      />
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
            if (!(await useSavedProjects.getState().preserve()))
              throw new Error(
                useSavedProjects.getState().error ??
                  'Your current house could not be saved. Try again.',
              );
            useProject.getState().loadProject(result.compiled, undefined, result.memory);
            close();
          } catch (error) {
            notify(`Could not open this house. ${editingError(error)}`);
          } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
          }
        }}
      />
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
                Save current house instead
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
