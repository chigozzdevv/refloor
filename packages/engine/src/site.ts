import type { Building } from '@refloor/scene';

export function compoundFootprint(building: Building) {
  const minX = Math.min(...building.floors.map((floor) => floor.footprint.x));
  const minZ = Math.min(...building.floors.map((floor) => floor.footprint.z));
  const maxX = Math.max(
    ...building.floors.map((floor) => floor.footprint.x + floor.footprint.width),
  );
  const maxZ = Math.max(
    ...building.floors.map((floor) => floor.footprint.z + floor.footprint.depth),
  );
  return { x: minX - 3.5, z: minZ - 5.5, width: maxX - minX + 7, depth: maxZ - minZ + 9 };
}
