import type { Building, Material, SceneCommand, SceneEdit, SceneObject } from '@refloor/scene';

export const finish: Material = {
  color: '#f2eadb',
  roughness: 0.8,
  metalness: 0,
  opacity: 1,
  textureId: null,
};

export function createBuilding(): Building {
  return structuredClone({
    schemaVersion: 1,
    units: 'metres',
    id: 'house-1',
    name: 'Two-room house',
    revision: 0,
    floors: [
      {
        id: 'ground',
        name: 'Ground floor',
        elevation: 0,
        height: 2.8,
        slabThickness: 0.2,
        footprint: { x: 0, z: 0, width: 10, depth: 6 },
        voids: [],
        rooms: [
          {
            id: 'living',
            name: 'Living room',
            kind: 'living',
            footprint: { x: 0, z: 0, width: 6, depth: 6 },
            wallIds: ['south', 'west', 'north', 'partition'],
            floorMaterial: finish,
          },
          {
            id: 'bedroom',
            name: 'Bedroom',
            kind: 'bedroom',
            footprint: { x: 6, z: 0, width: 4, depth: 6 },
            wallIds: ['south', 'east', 'north', 'partition'],
            floorMaterial: finish,
          },
        ],
        walls: [
          {
            id: 'south',
            start: { x: 0, z: 0 },
            end: { x: 10, z: 0 },
            height: 2.8,
            thickness: 0.15,
            material: finish,
            openings: [
              {
                id: 'entrance',
                kind: 'door',
                offset: 1,
                width: 0.9,
                height: 2.1,
                material: finish,
                hinge: 'start',
                swing: 'inward',
                state: { open: false },
              },
              {
                id: 'window',
                kind: 'window',
                offset: 7,
                width: 1.5,
                height: 1,
                sill: 1,
                material: finish,
              },
            ],
          },
          {
            id: 'north',
            start: { x: 0, z: 6 },
            end: { x: 10, z: 6 },
            height: 2.8,
            thickness: 0.15,
            material: finish,
            openings: [],
          },
          {
            id: 'west',
            start: { x: 0, z: 0 },
            end: { x: 0, z: 6 },
            height: 2.8,
            thickness: 0.15,
            material: finish,
            openings: [],
          },
          {
            id: 'east',
            start: { x: 10, z: 0 },
            end: { x: 10, z: 6 },
            height: 2.8,
            thickness: 0.15,
            material: finish,
            openings: [],
          },
          {
            id: 'partition',
            start: { x: 6, z: 0 },
            end: { x: 6, z: 6 },
            height: 2.8,
            thickness: 0.15,
            material: finish,
            openings: [
              {
                id: 'bedroom-door',
                kind: 'door',
                offset: 2,
                width: 0.9,
                height: 2.1,
                material: finish,
                hinge: 'end',
                swing: 'inward',
                state: { open: false },
              },
            ],
          },
        ],
      },
    ],
    stairs: [],
    roof: { id: 'roof', kind: 'flat', pitch: 0, overhang: 0.2, material: finish },
    objects: [
      {
        id: 'sofa',
        assetId: 'catalogue/sofa',
        label: 'Sofa',
        kind: 'sofa',
        floorId: 'ground',
        roomId: 'living',
        position: { x: 2, y: 0, z: 2 },
        rotation: 0,
        dimensions: { width: 2, height: 0.8, depth: 0.9 },
        materials: { body: finish },
        behaviours: [],
      },
      {
        id: 'tv',
        assetId: 'catalogue/tv',
        label: 'Television',
        kind: 'television',
        floorId: 'ground',
        roomId: 'living',
        position: { x: 4.5, y: 0.9, z: 3 },
        rotation: 0,
        dimensions: { width: 1.4, height: 0.8, depth: 0.25 },
        materials: { body: finish },
        behaviours: [
          {
            kind: 'television',
            screenNode: 'screen',
            state: { powered: false, muted: true, volume: 0.5, source: 'asset:tv-demo.mp4' },
          },
        ],
      },
      {
        id: 'lamp',
        assetId: 'catalogue/lamp',
        label: 'Lamp',
        kind: 'light',
        floorId: 'ground',
        roomId: 'living',
        position: { x: 2, y: 2.5, z: 4 },
        rotation: 0,
        dimensions: { width: 0.2, height: 0.2, depth: 0.2 },
        materials: { body: finish },
        behaviours: [{ kind: 'light', state: { powered: true, intensity: 2, color: '#ffffff' } }],
      },
    ],
  });
}

export function createTwoStorey(): Building {
  const building = createBuilding();
  const upper = structuredClone(building.floors[0]);
  if (!upper) throw new Error('Fixture requires a ground floor');
  upper.id = 'upper';
  upper.name = 'Upper floor';
  upper.elevation = 3;
  for (const room of upper.rooms) {
    room.id = `upper-${room.id}`;
    room.wallIds = room.wallIds.map((id) => `upper-${id}`);
  }
  for (const wall of upper.walls) {
    wall.id = `upper-${wall.id}`;
    for (const opening of wall.openings) opening.id = `upper-${opening.id}`;
  }
  const footprint = { x: 3, z: 0, width: 2.4, depth: 4 };
  upper.voids.push({
    id: 'stair-opening',
    kind: 'stairwell',
    footprint: structuredClone(footprint),
  });
  building.floors.push(upper);
  building.stairs.push({
    id: 'stairs',
    kind: 'u-shaped',
    lowerFloorId: 'ground',
    upperFloorId: 'upper',
    openingId: 'stair-opening',
    footprint,
    heading: 0,
    flightWidth: 1,
    landingDepth: 1.1,
    treadDepth: 0.28,
    risers: 18,
    material: finish,
  });
  return building;
}

export function createChair(): SceneObject {
  return {
    id: 'chair',
    assetId: 'catalogue/chair',
    label: 'Chair',
    kind: 'chair',
    floorId: 'ground',
    roomId: 'bedroom',
    position: { x: 8, y: 0, z: 3 },
    rotation: 0,
    dimensions: { width: 0.6, height: 1, depth: 0.6 },
    materials: { body: finish },
    behaviours: [],
  };
}

export function edit(commands: SceneCommand[], expectedRevision = 0, id = 'edit-1'): SceneEdit {
  return { id, at: '2026-10-18T12:00:00Z', expectedRevision, commands };
}

export function getObject(building: Building, id: string): SceneObject {
  const object = building.objects.find((value) => value.id === id);
  if (!object) throw new Error(`Fixture object missing: ${id}`);
  return object;
}

export function first<T>(values: T[]): T {
  const value = values[0];
  if (!value) throw new Error('Fixture collection is empty');
  return value;
}
