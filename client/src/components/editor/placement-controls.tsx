import { useState } from 'react';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';

export function PlacementControls({ object }: { object: SceneObject }) {
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
