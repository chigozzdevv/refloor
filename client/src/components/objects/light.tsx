import { Power } from 'lucide-react';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';

export function LightControls({ object }: { object: SceneObject }) {
  const edit = useProject((state) => state.edit);
  const light = object.behaviours.find((value) => value.kind === 'light');
  if (!light) return null;
  return (
    <section className="device-controls" aria-label="Light controls">
      <div className="device-heading">
        <span className="field-caption">LIGHT</span>
        <span className={`device-state ${light.state.powered ? 'on' : ''}`}>
          {light.state.powered ? 'on' : 'off'}
        </span>
      </div>
      <button
        className="tool-button"
        onClick={() =>
          edit([
            { type: 'set-light', objectId: object.id, state: { powered: !light.state.powered } },
          ])
        }
      >
        <Power size={14} />
        {light.state.powered ? 'Turn off light' : 'Turn on light'}
      </button>
      <label className="field-caption">
        BRIGHTNESS
        <input
          key={light.state.intensity}
          aria-label="Light brightness"
          type="range"
          min={0}
          max={10}
          step={0.25}
          defaultValue={light.state.intensity}
          onPointerUp={(event) =>
            edit([
              {
                type: 'set-light',
                objectId: object.id,
                state: { intensity: event.currentTarget.valueAsNumber },
              },
            ])
          }
          onKeyUp={(event) =>
            edit([
              {
                type: 'set-light',
                objectId: object.id,
                state: { intensity: event.currentTarget.valueAsNumber },
              },
            ])
          }
        />
      </label>
      <div className="light-colours">
        {[
          ['Warm', '#ffe6bf'],
          ['Neutral', '#fff4e0'],
          ['Cool', '#dfedff'],
        ].map(([name, color]) => (
          <button
            className={`tool-button ${light.state.color === color ? 'selected' : ''}`}
            key={color}
            onClick={() =>
              edit([{ type: 'set-light', objectId: object.id, state: { color: color! } }])
            }
          >
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}
