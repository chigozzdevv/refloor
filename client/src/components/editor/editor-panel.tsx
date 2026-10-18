import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Crosshair, Move, RotateCw, Trash2, X } from 'lucide-react';
import { catalogue } from '@refloor/catalogue';
import { useProject } from '@/shared/scene/scene-store';
import { replacementCommand } from '@/shared/editor/placement';
import { PlacementControls } from '@/components/editor/placement-controls';
import { MaterialPicker } from '@/components/editor/material-picker';
import { DeviceControls } from '@/components/objects/device-controls';

export function EditorPanel() {
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
  const [slot, setSlot] = useState('body'),
    [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [selection?.id]);
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
    <aside className={`inspector ${collapsed ? 'collapsed' : ''}`} aria-label="Edit selected item">
      <div className="panel-heading">
        <span className="eyebrow">
          {collapsed ? (object?.label ?? 'Surface finish') : 'MAKE IT YOURS'}
        </span>
        <div className="inspector-heading-actions">
          <button
            className="icon-button"
            aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Close object details"
            onClick={() => select(null)}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="inspector-content" hidden={collapsed}>
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
            <PlacementControls
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
          <MaterialPicker
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
      </div>
    </aside>
  );
}
