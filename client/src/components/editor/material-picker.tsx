import { finishes, wallFinishes } from '@refloor/catalogue';
import type { Material } from '@refloor/scene';

export function MaterialPicker({
  material,
  onChange,
  wall = false,
  floor = false,
}: {
  material: Material;
  onChange: (value: Material) => void;
  wall?: boolean;
  floor?: boolean;
}) {
  const names = wall
    ? wallFinishes
    : floor
      ? (['oak', 'walnut'] as const)
      : (['linen', 'olive', 'tobacco', 'oak', 'walnut', 'black'] as const);
  return (
    <div className="finish-controls">
      <span className="field-caption">
        {wall ? 'WALL FINISH' : floor ? 'FLOOR FINISH' : 'MATERIAL & COLOUR'}
      </span>
      <div className="finish-swatches">
        {names.map((name) => (
          <button
            key={name}
            title={name}
            aria-label={`Apply ${name} finish`}
            className={`swatch ${material.color === finishes[name].color ? 'selected' : ''}`}
            style={{ background: finishes[name].color }}
            onClick={() => onChange(finishes[name])}
          />
        ))}
        <label className="custom-colour" title="Choose a colour">
          <input
            aria-label="Custom colour"
            type="color"
            value={material.color}
            onChange={(event) => onChange({ ...material, color: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
