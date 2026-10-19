import { useState } from 'react';
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
  const [widthInput, setWidthInput] = useState('12'),
    [depthInput, setDepthInput] = useState('10');
  const width = Number(widthInput),
    depth = Number(depthInput),
    validWidth = Number.isFinite(width) && width >= 11.5 && width <= 16,
    validDepth = Number.isFinite(depth) && depth >= 9.5 && depth <= 14,
    valid = validWidth && validDepth;
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
        <p className="home-footprint">Building footprint</p>
        <div className="home-dimensions" aria-describedby="home-dimension-note">
          <label className="field-caption">
            Width (m)
            <input
              aria-label="House width"
              type="number"
              min={11.5}
              max={16}
              step={0.5}
              value={widthInput}
              aria-invalid={!validWidth}
              onChange={(event) => setWidthInput(event.target.value)}
            />
          </label>
          <label className="field-caption">
            Depth (m)
            <input
              aria-label="House depth"
              type="number"
              min={9.5}
              max={14}
              step={0.5}
              value={depthInput}
              aria-invalid={!validDepth}
              onChange={(event) => setDepthInput(event.target.value)}
            />
          </label>
        </div>
        <p
          id="home-dimension-note"
          className="home-dimension-note"
          role={valid ? undefined : 'status'}
        >
          {valid
            ? `${width} × ${depth} m · ${Math.round(width * depth)} m² per floor, including walls`
            : 'Width: 11.5–16 m. Depth: 9.5–14 m.'}
        </p>
        <div className="home-options">
          {([1, 2] as const).map((storeys) => (
            <button
              key={storeys}
              className="home-option"
              disabled={!valid}
              onClick={() => {
                try {
                  createHome(storeys, width, depth);
                  created();
                } catch {
                  useProject
                    .getState()
                    .notify('Choose a width from 11.5–16 m and a depth from 9.5–14 m.');
                }
              }}
            >
              <HousePreview
                storeys={storeys}
                width={validWidth ? width : 12}
                depth={validDepth ? depth : 10}
              />
              <span className="home-option-caption">
                <span>
                  <strong>{storeys === 1 ? 'The Garden House' : 'The Linden House'}</strong>
                  <small>
                    {storeys === 1 ? 'Bungalow' : 'Two storeys'}
                    {valid ? ` · ${Math.round(width * depth * storeys)} m² total` : ''}
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
