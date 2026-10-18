import type { Building } from '@refloor/scene';
import { boxPart } from '@refloor/engine/geometry/part';
import { gableMesh } from '@refloor/engine/geometry/mesh';
import { fail } from '@refloor/engine/errors';
import type { MeshPart } from '@refloor/engine/types';

export function buildRoof(building: Building): MeshPart[] {
  const top = [...building.floors].sort((a, b) => b.elevation - a.elevation)[0];
  if (!top) fail('ROOF_FLOOR', building.roof.id, 'Roof requires a floor');
  const { roof } = building;
  const width = top.footprint.width + roof.overhang * 2,
    depth = top.footprint.depth + roof.overhang * 2;
  const base = {
    id: `${roof.id}:shell`,
    entityId: roof.id,
    floorId: top.id,
    role: 'roof' as const,
    rotation: 0,
    position: {
      x: top.footprint.x + top.footprint.width / 2,
      y: top.elevation + top.height,
      z: top.footprint.z + top.footprint.depth / 2,
    },
  };
  if (roof.kind === 'flat')
    return [
      boxPart(
        { ...base, position: { ...base.position, y: base.position.y + top.slabThickness / 2 } },
        { x: width, y: top.slabThickness, z: depth },
        roof.material,
      ),
    ];
  const height = (Math.tan(roof.pitch) * width) / 2;
  if (!Number.isFinite(height) || height <= 1e-6)
    fail('ROOF_PITCH', roof.id, 'A gable roof requires a positive ridge height');
  const mesh = gableMesh(width, depth, height);
  return [{ ...base, material: roof.material, mesh, collider: { ...base, shape: 'mesh', mesh } }];
}
