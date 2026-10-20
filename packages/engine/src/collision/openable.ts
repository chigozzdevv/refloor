import { openableClearance } from '@refloor/scene';
import type { SceneObject } from '@refloor/scene';
import { worldPoint } from '@refloor/engine/math';
import type { BoxCollider } from '@refloor/engine/types';

export function openableBounds(object: SceneObject, elevation: number): BoxCollider | null {
  if (!object.behaviours.some((behaviour) => behaviour.kind === 'openable' && behaviour.state.open))
    return null;
  const clearance = openableClearance(object);
  if (!clearance) return null;
  return {
    id: `${object.id}:openable-clearance`,
    entityId: object.id,
    floorId: object.floorId,
    role: 'furniture',
    shape: 'box',
    rotation: object.rotation,
    position: worldPoint(
      {
        x: clearance.offsetX,
        y: clearance.height / 2,
        z: (object.dimensions.depth + clearance.depth) / 2,
      },
      { ...object.position, y: elevation + object.position.y },
      object.rotation,
    ),
    size: { x: clearance.width, y: clearance.height, z: clearance.depth },
  };
}
