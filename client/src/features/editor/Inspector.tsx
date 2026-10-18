import { useState } from 'react';
import { Crosshair, Move, RotateCw, Trash2, X } from 'lucide-react';
import { catalogue, finishes, wallFinishes } from '@refloor/catalogue';
import type { Material, SceneObject } from '@refloor/scene';
import { useProject } from '@/features/projects/project-store';
import { replacementCommand } from '@/runtime/editing/placement';
import { DeviceControls } from '@/features/editor/DeviceControls';

function ObjectPosition({ object }: { object: SceneObject }) {
  const edit = useProject((state) => state.edit),
    compiled = useProject((state) => state.compiled);
  const [position, setPosition] = useState({
    x: Number(object.position.x.toFixed(3)),
    y: Number(object.position.y.toFixed(3)),
    z: Number(object.position.z.toFixed(3)),
    rotation: Math.round((object.rotation * 180) / Math.PI),
  });
  return (
    <form
      className="position-form"
      onSubmit={(event) => {
        event.preventDefault();
        const room = compiled.building.floors
          .find((value) => value.id === object.floorId)
          ?.rooms.find(
            (value) =>
              position.x >= value.footprint.x &&
              position.x <= value.footprint.x + value.footprint.width &&
              position.z >= value.footprint.z &&
              position.z <= value.footprint.z + value.footprint.depth,
          );
        edit([
          {
            type: 'move-object',
            objectId: object.id,
            roomId: room?.id ?? object.roomId,
            position: { x: position.x, y: position.y, z: position.z },
            rotation: (position.rotation * Math.PI) / 180,
          },
        ]);
      }}
    >
      <span className="field-caption">POSITION · METRES</span>
      <div className="coordinate-grid">
        {(['x', 'y', 'z', 'rotation'] as const).map((axis) => (
          <label key={axis}>
            {axis === 'rotation' ? 'Angle °' : axis.toUpperCase()}
            <input
              type="number"
              aria-label={`${axis} position`}
              value={position[axis]}
              step={axis === 'rotation' ? 1 : 0.01}
              required
              onChange={(event) => setPosition({ ...position, [axis]: event.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
      <button className="button compact outline" type="submit">
        Apply position
      </button>
    </form>
  );
}

function Finishes({
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

export function Inspector() {
  const { compiled, selection, select, edit, transformMode, setTransformMode, focusObject } =
    useProject();
  const object =
      selection?.kind === 'object'
        ? compiled.building.objects.find((value) => value.id === selection.id)
        : undefined,
    wall =
      selection?.kind === 'wall'
        ? compiled.building.floors
            .flatMap((floor) => floor.walls)
            .find((value) => value.id === selection.id)
        : undefined;
  const [slot, setSlot] = useState('body');
  const room =
    selection?.kind === 'floor'
      ? compiled.building.floors
          .flatMap((value) => value.rooms)
          .find((value) => value.id === selection.id)
      : undefined;
  if (!object && !wall && !room) return null;
  const activeSlot = object?.materials[slot]
      ? slot
      : (Object.keys(object?.materials ?? {})[0] ?? 'body'),
    material = object?.materials[activeSlot] ?? wall?.material ?? room?.floorMaterial;
  return (
    <aside className="inspector" aria-label="Edit selected item">
      <div className="panel-heading">
        <span className="eyebrow">MAKE IT YOURS</span>
        <button
          className="icon-button"
          aria-label="Close object details"
          onClick={() => select(null)}
        >
          <X size={18} />
        </button>
      </div>
      <h2>{object?.label ?? (room ? `${room.name} floor` : 'Wall finish')}</h2>
      {object && (
        <>
          <DeviceControls key={object.assetId} object={object} />
          <p>
            {object.dimensions.width} × {object.dimensions.depth} × {object.dimensions.height} m
          </p>
          <div className="edit-tools">
            <button
              className={`tool-button ${transformMode === 'translate' ? 'selected' : ''}`}
              onClick={() => setTransformMode('translate')}
            >
              <Move size={15} /> Move
            </button>
            <button
              className={`tool-button ${transformMode === 'rotate' ? 'selected' : ''}`}
              onClick={() => setTransformMode('rotate')}
            >
              <RotateCw size={15} /> Rotate
            </button>
            <button
              className="icon-button"
              title="Focus on object"
              aria-label="Focus on object"
              onClick={() => focusObject(object.id)}
            >
              <Crosshair size={16} />
            </button>
          </div>
          <p className="helper-text">
            Drag the coloured handles in overview, or enter an exact position.
          </p>
          <ObjectPosition
            key={`${object.id}:${object.position.x}:${object.position.y}:${object.position.z}:${object.rotation}`}
            object={object}
          />
          {Object.keys(object.materials).length > 1 && (
            <label className="field-caption">
              SURFACE
              <select
                aria-label="Material surface"
                value={activeSlot}
                onChange={(event) => setSlot(event.target.value)}
              >
                {Object.keys(object.materials).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {material && (
        <Finishes
          material={material}
          wall={!!wall}
          floor={!!room}
          onChange={(value) =>
            edit(
              object
                ? [
                    {
                      type: 'set-object-material',
                      objectId: object.id,
                      slot: activeSlot,
                      material: value,
                    },
                  ]
                : room
                  ? [{ type: 'set-room-floor-material', roomId: room.id, material: value }]
                  : [{ type: 'set-wall-material', wallId: wall!.id, material: value }],
            )
          }
        />
      )}
      {object && (
        <>
          <label className="field-caption">
            REPLACE WITH
            <select
              aria-label="Replace furniture"
              value={object.assetId}
              onChange={(event) => edit([replacementCommand(object.id, event.target.value)])}
            >
              {catalogue.map((entry) => (
                <option key={entry.assetId} value={entry.assetId}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="remove-button"
            onClick={() => edit([{ type: 'remove-object', objectId: object.id }])}
          >
            <Trash2 size={14} /> Remove item
          </button>
        </>
      )}
    </aside>
  );
}
