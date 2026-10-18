import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { compoundFootprint } from '@refloor/engine';
import type { Floor, Wall } from '@refloor/scene';
import { entryPose } from '@/shared/navigation/entry';

export function exteriorNormal(wall: Wall, floor: Floor) {
  const { x, z, width, depth } = floor.footprint;
  if (Math.abs(wall.start.z - wall.end.z) < 0.001) {
    if (Math.abs(wall.start.z - z) < 0.001) return { x: 0, z: -1 };
    if (Math.abs(wall.start.z - z - depth) < 0.001) return { x: 0, z: 1 };
  } else if (Math.abs(wall.start.x - wall.end.x) < 0.001) {
    if (Math.abs(wall.start.x - x) < 0.001) return { x: -1, z: 0 };
    if (Math.abs(wall.start.x - x - width) < 0.001) return { x: 1, z: 0 };
  }
  return null;
}

export function exteriorLayout(compiled: CompiledBuilding) {
  const floors = compiled.building.floors;
  const ground = floors.reduce((a, b) => (a.elevation < b.elevation ? a : b));
  const top = floors.reduce((a, b) => (a.elevation > b.elevation ? a : b));
  const minX = Math.min(...floors.map((floor) => floor.footprint.x));
  const minZ = Math.min(...floors.map((floor) => floor.footprint.z));
  const maxX = Math.max(...floors.map((floor) => floor.footprint.x + floor.footprint.width));
  const maxZ = Math.max(...floors.map((floor) => floor.footprint.z + floor.footprint.depth));
  const centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const entry = entryPose(compiled),
    door = compiled.doors.find((value) => value.id === entry.doorId)!;
  const outward = { x: -entry.normal.x, z: -entry.normal.z };
  const tangent = { x: entry.normal.z, z: -entry.normal.x };
  const entrancePoint = (side: number, distance: number, y: number): Point3 => ({
    x: door.centre.x + tangent.x * side + outward.x * distance,
    y: ground.elevation + y,
    z: door.centre.z + tangent.z * side + outward.z * distance,
  });
  const eaves = top.elevation + top.height;
  const height =
    eaves +
    (compiled.building.roof.kind === 'gable'
      ? (Math.tan(compiled.building.roof.pitch) *
          (top.footprint.width + compiled.building.roof.overhang * 2)) /
        2
      : top.slabThickness + 0.28);
  return {
    ground,
    top,
    centre,
    width: maxX - minX,
    depth: maxZ - minZ,
    eaves,
    height,
    outward,
    tangent,
    door,
    entrancePoint,
    rotation: Math.atan2(outward.x, outward.z),
    compound: compoundFootprint(compiled.building),
    paving: [
      {
        position: { ...centre, y: ground.elevation - 0.18 },
        width: maxX - minX + 1.6,
        depth: maxZ - minZ + 1.6,
        height: 0.07,
        rotation: 0,
      },
    ],
  };
}

export function exteriorCamera(compiled: CompiledBuilding, aspect = 1.6) {
  const site = exteriorLayout(compiled),
    span = Math.max(site.width, site.depth, site.height * 1.2);
  const target = {
    x: site.centre.x + site.outward.x * 0.7,
    y: site.ground.elevation + site.height * 0.43,
    z: site.centre.z + site.outward.z * 0.7,
  };
  const direction = {
    x: site.outward.x * 1.05 + site.tangent.x * 0.85,
    y: 0.72,
    z: site.outward.z * 1.05 + site.tangent.z * 0.85,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const halfFov = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * aspect));
  const radius = Math.hypot(site.compound.width, site.height, site.compound.depth) / 2;
  const distance = (radius / Math.sin(halfFov)) * 1.08;
  return {
    target,
    position: {
      x: target.x + (direction.x / length) * distance,
      y: target.y + (direction.y / length) * distance,
      z: target.z + (direction.z / length) * distance,
    },
    span,
    distance,
  };
}
