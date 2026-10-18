import type { Building, Material } from '@refloor/scene';
import { boxMesh } from '@refloor/engine/geometry/mesh';
import { boxPart } from '@refloor/engine/geometry/part';
import { quarterTurn, worldPoint } from '@refloor/engine/math';
import type { MeshPart, Point3 } from '@refloor/engine/types';

type Stair = Building['stairs'][number];
const metal: Material = {
  color: '#464a40',
  roughness: 0.38,
  metalness: 0.6,
  opacity: 1,
  textureId: null,
};

export function buildRailings(building: Building, stair: Stair): MeshPart[] {
  const lower = building.floors.find((floor) => floor.id === stair.lowerFloorId),
    upper = building.floors.find((floor) => floor.id === stair.upperFloorId);
  if (!lower || !upper) return [];
  const odd = (quarterTurn(stair.heading) ?? 0) % 2;
  const width = odd ? stair.footprint.depth : stair.footprint.width,
    depth = odd ? stair.footprint.width : stair.footprint.depth;
  const rise = upper.elevation - lower.elevation,
    front = -depth / 2,
    back = depth / 2;
  const origin = {
    x: stair.footprint.x + stair.footprint.width / 2,
    y: lower.elevation,
    z: stair.footprint.z + stair.footprint.depth / 2,
  };
  const world = (point: Point3) => worldPoint(point, origin, stair.heading);
  const parts: MeshPart[] = [];
  let index = 0;
  const railing = (from: Point3, to: Point3, floorId: string) => {
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.65));
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        point = world({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t + 0.5,
          z: from.z + (to.z - from.z) * t,
        });
      parts.push(
        boxPart(
          {
            id: `${stair.id}:rail-post:${index++}`,
            entityId: stair.id,
            floorId,
            role: 'stair-railing',
            position: point,
            rotation: stair.heading,
          },
          { x: 0.032, y: 1, z: 0.032 },
          metal,
        ),
      );
    }
    const a = world({ ...from, y: from.y + 1.02 }),
      b = world({ ...to, y: to.y + 1.02 });
    const direction = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      length = Math.hypot(direction.x, direction.y, direction.z);
    if (length < 1e-6) return;
    const y = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    const horizontal = Math.hypot(y.x, y.z),
      x =
        horizontal > 1e-6
          ? { x: y.z / horizontal, y: 0, z: -y.x / horizontal }
          : { x: 1, y: 0, z: 0 };
    const z = { x: x.y * y.z - x.z * y.y, y: x.z * y.x - x.x * y.z, z: x.x * y.y - x.y * y.x };
    const mesh = boxMesh({ x: 0.048, y: length, z: 0.048 });
    for (const values of [mesh.positions, mesh.normals])
      for (let i = 0; i < values.length; i += 3) {
        const px = values[i] ?? 0,
          py = values[i + 1] ?? 0,
          pz = values[i + 2] ?? 0;
        values[i] = x.x * px + y.x * py + z.x * pz;
        values[i + 1] = x.y * px + y.y * py + z.y * pz;
        values[i + 2] = x.z * px + y.z * py + z.z * pz;
      }
    const base = {
      id: `${stair.id}:handrail:${index++}`,
      entityId: stair.id,
      floorId,
      role: 'stair-railing' as const,
      rotation: 0,
      position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
    };
    parts.push({
      ...base,
      material: stair.material,
      mesh,
      collider: { ...base, shape: 'mesh', mesh },
    });
  };
  const left = -width / 2,
    right = width / 2;
  if (stair.kind === 'u-shaped') {
    const firstRisers = Math.floor(stair.risers / 2),
      secondRisers = stair.risers - firstRisers,
      run = (Math.max(firstRisers, secondRisers) - 1) * stair.treadDepth,
      turn = front + run,
      middle = (rise * firstRisers) / stair.risers;
    for (const x of [left - 0.018, left + stair.flightWidth + 0.018])
      railing({ x, y: 0, z: front }, { x, y: middle, z: turn }, lower.id);
    for (const x of [right + 0.018, right - stair.flightWidth - 0.018])
      railing({ x, y: rise, z: front }, { x, y: middle, z: turn }, lower.id);
    railing({ x: left, y: middle, z: back }, { x: right, y: middle, z: back }, lower.id);
    railing(
      { x: left, y: rise, z: front },
      { x: right - stair.flightWidth, y: rise, z: front },
      upper.id,
    );
    railing({ x: left, y: rise, z: back }, { x: right, y: rise, z: back }, upper.id);
  } else {
    for (const x of [-stair.flightWidth / 2 - 0.018, stair.flightWidth / 2 + 0.018])
      railing({ x, y: 0, z: front }, { x, y: rise, z: back }, lower.id);
    railing({ x: left, y: rise, z: front }, { x: right, y: rise, z: front }, upper.id);
    for (const [from, to] of [
      [left, -stair.flightWidth / 2],
      [stair.flightWidth / 2, right],
    ])
      if (from !== undefined && to !== undefined && to - from > 0.05)
        railing({ x: from, y: rise, z: back }, { x: to, y: rise, z: back }, upper.id);
  }
  for (const x of [left, right])
    railing({ x, y: rise, z: front }, { x, y: rise, z: back }, upper.id);
  return parts;
}
