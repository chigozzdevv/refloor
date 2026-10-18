import type { SceneObject } from '@refloor/scene';
import type { BoxCollider, Collider, Point3, MeshData } from '@refloor/engine/types';
import { worldPoint } from '@refloor/engine/math';

const meshBounds = new WeakMap<
  Collider,
  { position: Point3; rotation: number; mesh: MeshData; bounds: BoxCollider }
>();

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
  const cached = meshBounds.get(collider);
  if (
    cached &&
    cached.rotation === collider.rotation &&
    cached.mesh === collider.mesh &&
    cached.position.x === collider.position.x &&
    cached.position.y === collider.position.y &&
    cached.position.z === collider.position.z
  )
    return cached.bounds;
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
  const bounds: BoxCollider = {
    ...collider,
    shape: 'box',
    rotation: 0,
    position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
  meshBounds.set(collider, {
    position: { ...collider.position },
    rotation: collider.rotation,
    mesh: collider.mesh,
    bounds,
  });
  return bounds;
}
