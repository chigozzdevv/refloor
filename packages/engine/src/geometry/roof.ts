import type { Building } from '@refloor/scene';
import { boxPart } from '@refloor/engine/geometry/part';
import { gableMesh } from '@refloor/engine/geometry/mesh';
import { fail } from '@refloor/engine/errors';
import type { MeshPart } from '@refloor/engine/types';
import { floorCourtyards, subtractRectangles } from '@refloor/scene/footprint';

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
    return subtractRectangles(
      { x: top.footprint.x - roof.overhang, z: top.footprint.z - roof.overhang, width, depth },
      floorCourtyards(top).map((cut) => {
        const inset = (axis: 'x' | 'z', size: 'width' | 'depth') => {
          const from =
            cut[axis] +
            (Math.abs(cut[axis] - top.footprint[axis]) < 1e-6 ? -roof.overhang : roof.overhang);
          const to =
            cut[axis] +
            cut[size] +
            (Math.abs(cut[axis] + cut[size] - top.footprint[axis] - top.footprint[size]) < 1e-6
              ? roof.overhang
              : -roof.overhang);
          return [from, to - from] as const;
        };
        const [x, width] = inset('x', 'width'),
          [z, depth] = inset('z', 'depth');
        return { x, z, width, depth };
      }),
    ).map((region, index) =>
      boxPart(
        {
          ...base,
          id: index ? `${roof.id}:shell:${index}` : base.id,
          position: {
            x: region.x + region.width / 2,
            z: region.z + region.depth / 2,
            y: base.position.y + top.slabThickness / 2,
          },
        },
        { x: region.width, y: top.slabThickness, z: region.depth },
        roof.material,
      ),
    );
  const height = (Math.tan(roof.pitch) * width) / 2;
  if (!Number.isFinite(height) || height <= 1e-6)
    fail('ROOF_PITCH', roof.id, 'A gable roof requires a positive ridge height');
  const mesh = gableMesh(width, depth, height);
  return [{ ...base, material: roof.material, mesh, collider: { ...base, shape: 'mesh', mesh } }];
}
