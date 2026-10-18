import type { SceneObject } from '@refloor/scene';
import type {
  BoxCollider,
  Collider,
  CompiledBuilding,
  Point3,
  StairConnection,
} from '@refloor/engine/types';
import { distanceToBox, worldPoint } from '@refloor/engine/math';

export function objectBounds(object: SceneObject, elevation: number): BoxCollider {
  return {
    id: `${object.id}:bounds`,
    entityId: object.id,
    floorId: object.floorId,
    role: 'furniture',
    shape: 'box',
    rotation: object.rotation,
    position: {
      x: object.position.x,
      y: elevation + object.position.y + object.dimensions.height / 2,
      z: object.position.z,
    },
    size: { x: object.dimensions.width, y: object.dimensions.height, z: object.dimensions.depth },
  };
}

export function colliderBounds(collider: Collider): BoxCollider {
  if (collider.shape === 'box') return collider;
  const points: Point3[] = [];
  for (let i = 0; i < collider.mesh.positions.length; i += 3)
    points.push(
      worldPoint(
        {
          x: collider.mesh.positions[i] ?? 0,
          y: collider.mesh.positions[i + 1] ?? 0,
          z: collider.mesh.positions[i + 2] ?? 0,
        },
        collider.position,
        collider.rotation,
      ),
    );
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    zs = points.map((p) => p.z);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    minZ = Math.min(...zs),
    maxX = Math.max(...xs),
    maxY = Math.max(...ys),
    maxZ = Math.max(...zs);
  return {
    ...collider,
    shape: 'box',
    rotation: 0,
    position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}

export function blockingCollider(
  compiled: CompiledBuilding,
  point: Point3,
  doorPolicy: 'openable' | 'current' = 'openable',
  stair?: StairConnection,
): Collider | undefined {
  const profile = compiled.options;
  return compiled.colliders.find((collider) => {
    if (collider.entityId === stair?.id) return false;
    if (doorPolicy === 'openable' && collider.role === 'door') return false;
    const box = colliderBounds(collider);
    // Stair path heights interpolate between tread centres before the final landing riser.
    const lowerOffset =
      profile.stepHeight +
      (collider.role === 'slab' && collider.floorId === stair?.upper.floorId
        ? stair.riserHeight
        : 0);
    if (
      box.position.y + box.size.y / 2 <= point.y + lowerOffset + 1e-6 ||
      box.position.y - box.size.y / 2 >= point.y + profile.headroom - 1e-6
    )
      return false;
    return distanceToBox(point, box) < profile.radius + profile.clearance - 1e-6;
  });
}

export function standingBlocked(
  compiled: CompiledBuilding,
  point: Point3,
  doorPolicy: 'openable' | 'current' = 'openable',
): boolean {
  return blockingCollider(compiled, point, doorPolicy) !== undefined;
}
