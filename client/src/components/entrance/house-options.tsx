import { MoveUpRight, X } from 'lucide-react';
import { useState } from 'react';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { HousePreview } from '@/components/entrance/house-preview';

export function HouseOptions({
  open,
  close,
  created,
}: {
  open: boolean;
  close: () => void;
  created: () => void;
}) {
  const width = 12,
    depth = 10;
  const createHome = useProject((state) => state.createHome);
  const [creating, setCreating] = useState(false),
    [error, setError] = useState<string | null>(null);
  const dismiss = () => {
    setError(null);
    close();
  };
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={creating ? undefined : dismiss}>
      <section
        className="create-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create a new space"
        aria-busy={creating}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <span>New house</span>
          <button className="icon-button" onClick={dismiss} aria-label="Close" disabled={creating}>
            <X size={18} />
          </button>
        </div>
        <p>Choose a starting space to explore and edit.</p>
        <div className="home-options">
          {([1, 2] as const).map((storeys) => (
            <button
              key={storeys}
              className="home-option"
              disabled={creating}
              onClick={async () => {
                setCreating(true);
                setError(null);
                try {
                  if (!(await useSavedProjects.getState().preserve())) {
                    setError(useSavedProjects.getState().error);
                    return;
                  }
                  createHome(storeys, width, depth);
                  created();
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : 'This house could not be opened.',
                  );
                } finally {
                  setCreating(false);
                }
              }}
            >
              <HousePreview storeys={storeys} width={width} depth={depth} />
              <span className="home-option-caption">
                <span>
                  <strong>{storeys === 1 ? 'The Garden House' : 'The Linden House'}</strong>
                  <small>
                    {storeys === 1 ? 'Bungalow' : 'Two storeys'}
                    {` · ${width * depth * storeys} m² total`}
                  </small>
                </span>
                <MoveUpRight size={18} />
              </span>
            </button>
          ))}
        </div>
        {creating && <p role="status">Saving your current house…</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
