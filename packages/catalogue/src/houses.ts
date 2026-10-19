import type { Building } from '@refloor/scene';
import { validateBuilding } from '@refloor/engine';
import { finishes } from '@refloor/catalogue/materials';
import { createFloor } from '@refloor/catalogue/houses/structure';
import { furnishHouse } from '@refloor/catalogue/houses/furnish';
import { furnishExterior } from '@refloor/catalogue/houses/exterior';

export type HouseOptions = {
  id: string;
  name: string;
  storeys: 1 | 2;
  width?: number;
  depth?: number;
};

export function createHouse({ id, name, storeys, width = 12, depth = 10 }: HouseOptions): Building {
  if (
    ![1, 2].includes(storeys) ||
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width < 11.5 ||
    width > 16 ||
    depth < 9.5 ||
    depth > 14
  )
    throw new Error(
      'Choose one or two storeys, a width from 11.5 to 16 m and a depth from 9.5 to 14 m',
    );
  const building: Building = {
    schemaVersion: 1,
    units: 'metres',
    id,
    name,
    revision: 0,
    floors: [createFloor('ground', 0, width, depth, false)],
    stairs: [],
    objects: [],
    roof: { id: 'roof', kind: 'flat', pitch: 0, overhang: 0.24, material: finishes.asphalt },
  };
  if (storeys === 2) {
    const upper = createFloor('first', 3, width, depth, true),
      footprint = { x: 0.8, z: 0.5, width: 2.4, depth: 4 };
    upper.voids.push({ id: 'stairwell', kind: 'stairwell', footprint: structuredClone(footprint) });
    building.floors.push(upper);
    building.stairs.push({
      id: 'staircase',
      kind: 'u-shaped',
      lowerFloorId: 'ground',
      upperFloorId: 'first',
      openingId: 'stairwell',
      footprint,
      heading: Math.PI,
      flightWidth: 1,
      landingDepth: 1.1,
      treadDepth: 0.28,
      risers: 18,
      material: finishes.oak,
    });
  }
  furnishHouse(building);
  furnishExterior(building);
  return validateBuilding(building).building;
}
