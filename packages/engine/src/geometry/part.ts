import type { Material } from '@refloor/scene';
import { boxMesh } from '@refloor/engine/geometry/mesh';
import { fail } from '@refloor/engine/errors';
import type { BoxCollider, ColliderBase, MeshPart, Point3 } from '@refloor/engine/types';

export function boxPart(base: ColliderBase, size: Point3, material: Material): MeshPart {
  if (Object.values(size).some((value) => !Number.isFinite(value) || value <= 1e-6))
    fail('DEGENERATE_GEOMETRY', base.entityId, 'Solid dimensions must exceed numerical tolerance');
  const collider: BoxCollider = { ...base, shape: 'box', size };
  return {
    id: base.id,
    entityId: base.entityId,
    floorId: base.floorId,
    role: base.role,
    material,
    collider,
    mesh: boxMesh(size),
  };
}
