import { useState } from 'react';
import { MoveUpRight, X } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function HouseOptions({ open, close }: { open: boolean; close: () => void }) {
  const [width, setWidth] = useState(12),
    [depth, setDepth] = useState(10);
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
          <span className="eyebrow">START WITH A SPACE</span>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <h2>Room for possibilities.</h2>
        <p>Choose a starting home. Every room and object is yours to change.</p>
        <div className="home-dimensions">
          <label className="field-caption">
            WIDTH · M
            <input
              aria-label="House width"
              type="number"
              min={11.5}
              max={16}
              step={0.5}
              value={width}
              onChange={(event) => setWidth(event.target.valueAsNumber)}
            />
          </label>
          <label className="field-caption">
            DEPTH · M
            <input
              aria-label="House depth"
              type="number"
              min={9.5}
              max={14}
              step={0.5}
              value={depth}
              onChange={(event) => setDepth(event.target.valueAsNumber)}
            />
          </label>
        </div>
        {([1, 2] as const).map((storeys) => (
          <button
            key={storeys}
            className="home-option"
            onClick={() => {
              try {
                createHome(storeys, width, depth);
                close();
              } catch {
                useProject
                  .getState()
                  .notify('Choose a width from 11.5–16 m and a depth from 9.5–14 m.');
              }
            }}
          >
            <span>
              <strong>{storeys === 1 ? 'The Garden House' : 'The Linden House'}</strong>
              <small>
                {storeys === 1
                  ? `A light-filled bungalow · ${Math.round(width * depth)} m²`
                  : `Two storeys, room to grow · ${Math.round(width * depth * 2)} m²`}
              </small>
            </span>
            <MoveUpRight size={20} />
          </button>
        ))}
      </section>
    </div>
  );
}
