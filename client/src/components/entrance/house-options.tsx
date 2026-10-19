import { MoveUpRight, X } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
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
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="create-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create a new space"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <span>New house</span>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p>Choose a starting space to explore and edit.</p>
        <div className="home-options">
          {([1, 2] as const).map((storeys) => (
            <button
              key={storeys}
              className="home-option"
              onClick={() => {
                createHome(storeys, width, depth);
                created();
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
      </section>
    </div>
  );
}
