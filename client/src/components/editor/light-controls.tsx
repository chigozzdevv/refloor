import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { lightTuning } from '@refloor/catalogue';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { targetIdentity } from '@/shared/editor/identity';

export function LightControls({ object, disabled }: { object: SceneObject; disabled: boolean }) {
  const tuning = lightTuning(object),
    state = object.behaviours.find((item) => item.kind === 'light')?.state,
    edit = useProject((value) => value.edit),
    current =
      tuning && state
        ? Math.max(0, Math.min(200, Math.round((state.intensity / tuning.normal) * 100)))
        : 100,
    [percent, setPercent] = useState(current);
  useEffect(() => setPercent(current), [current, object.id, state?.intensity]);
  if (!tuning || !state) return null;
  const details = (label: string) => {
    const identity = targetIdentity(useProject.getState().compiled.building, {
      kind: 'object',
      id: object.id,
    });
    return { label, target: identity ? `${identity.label} · ${identity.location}` : object.label };
  };
  const commit = () => {
    const intensity = (percent / 100) * tuning.normal;
    const actual = useProject
      .getState()
      .compiled.building.objects.find((item) => item.id === object.id)
      ?.behaviours.find((item) => item.kind === 'light')?.state.intensity;
    if (actual === undefined || Math.abs(intensity - actual) < 0.001) return;
    if (
      !edit(
        [{ type: 'set-light', objectId: object.id, state: { intensity } }],
        details(`Set brightness to ${percent}%`),
      )
    )
      setPercent(current);
  };
  const normal =
    state.intensity === tuning.normal &&
    state.powered === tuning.defaults.powered &&
    state.color === tuning.defaults.color;
  return (
    <div className="light-controls">
      <label htmlFor={`brightness-${object.id}`}>
        Brightness{' '}
        <output>
          {percent}%{state.intensity > tuning.max ? ' · limited' : ''}
        </output>
      </label>
      <input
        id={`brightness-${object.id}`}
        type="range"
        aria-label="Light brightness"
        aria-valuetext={`${percent} percent; 100 is normal`}
        min={0}
        max={200}
        step={5}
        value={percent}
        disabled={disabled}
        onChange={(event) => setPercent(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          )
            commit();
        }}
        onBlur={commit}
        onPointerCancel={() => setPercent(current)}
      />
      <div className="light-control-footer">
        <span>0–200% · 100% normal</span>
        <button
          type="button"
          disabled={disabled || normal}
          onClick={() =>
            edit(
              [{ type: 'set-light', objectId: object.id, state: tuning.defaults }],
              details('Reset light'),
            )
          }
        >
          <RotateCcw size={11} /> Reset light
        </button>
      </div>
    </div>
  );
}
