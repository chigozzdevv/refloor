import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  checkClearance,
  checkReachability,
  compileBuilding,
  entrancePoints,
  findPath,
  validatePlacement,
} from '@refloor/engine';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';

const room = (
  name: string,
  uses: RoomRequirement['uses'],
  position: RoomRequirement['position'],
  size: RoomRequirement['size'] = 'standard',
  floor = 0,
): RoomRequirement => ({ name, uses, position, size, floor, side: null });

const bungalow: HouseRequirements = {
  name: 'Warm Contemporary Bungalow',
  storeys: 1,
  width: null,
  depth: null,
  rooms: [
    room(
      'Open-Plan Living, Dining and Kitchen',
      ['living', 'dining', 'kitchen'],
      'rear',
      'spacious',
    ),
    room('Bedroom One', ['bedroom'], 'front'),
    room('Bedroom Two', ['bedroom'], 'rear'),
    room('Bathroom', ['bathroom'], 'middle', 'compact'),
  ],
  circulation: {
    family: 'central-hall',
    gallerySide: 'left',
    stairPosition: 'rear',
    balance: 'public-wide',
  },
  design: {
    style: 'warm-contemporary',
    joinery: 'oak',
    hardware: 'brass',
    exterior: { finish: 'brick', color: '#ffffff' },
    roof: { finish: 'asphalt', color: '#505050' },
  },
  wallColor: '#f5f0e6',
  upholsteryColor: '#d8ccba',
  flooring: 'oak',
  roof: 'flat',
  unsupported: [],
};
const gallery: HouseRequirements = {
  name: 'Moody Modern Two-Storey Home',
  storeys: 2,
  width: null,
  depth: null,
  rooms: [
    room(
      'Open-Plan Living, Dining and Kitchen',
      ['living', 'dining', 'kitchen'],
      'front',
      'spacious',
    ),
    room('Ground-Floor Bathroom', ['bathroom'], 'middle', 'compact'),
    room('Workspace', ['workspace'], 'rear'),
    room('Primary Bedroom', ['bedroom'], 'rear', 'spacious', 1),
    room('Bedroom Two', ['bedroom'], 'middle', 'standard', 1),
    room('Bedroom Three', ['bedroom'], 'front', 'standard', 1),
    room('Upstairs Bathroom', ['bathroom'], 'middle', 'standard', 1),
  ],
  circulation: {
    family: 'side-gallery',
    gallerySide: 'right',
    stairPosition: 'front',
    balance: 'balanced',
  },
  design: {
    style: 'moody-modern',
    joinery: 'walnut',
    hardware: 'black',
    exterior: { finish: 'plaster', color: '#383838' },
    roof: { finish: 'asphalt', color: '#292929' },
  },
  wallColor: '#454545',
  upholsteryColor: '#56504d',
  flooring: 'walnut',
  roof: 'flat',
  unsupported: [],
};

describe('live house programme regressions', () => {
  it('keeps narrow bedrooms, useful storage and decoration reachable', async () => {
    const building = await generateLayout('compact-decor-regression', bungalow),
      compiled = compileBuilding(building),
      navigation = buildNavigation(compiled),
      bedroom = building.floors[0]!.rooms.find((value) => value.name === 'Bedroom One')!,
      plant = building.objects.find((value) => value.id === `${bedroom.id}/plant`)!;
    expect(
      building.floors[0]!.rooms.filter((value) => value.kind !== 'corridor').map(
        (value) => value.name,
      ),
    ).toEqual(expect.arrayContaining(bungalow.rooms.map((value) => value.name)));
    expect(building.objects.filter((value) => value.assetId === 'catalogue/plant')).toHaveLength(3);
    expect(plant).toBeDefined();
    const wardrobe = building.objects.find((value) => value.id === `${bedroom.id}/wardrobe`)!;
    expect(wardrobe.rotation).toBe(0);
    expect(wardrobe.position.z).toBeCloseTo(bedroom.footprint.z + 0.4);
    expect(checkReachability(navigation)).toEqual([]);
    expect(checkClearance(compiled)).toEqual([]);
  });

  it.each([
    ['public-wide bungalow', bungalow],
    ['public-wide bungalow with bedside drawers', { ...bungalow, width: 18 }],
    [
      'generous-glazing two-storey gallery',
      {
        ...gallery,
        design: { ...gallery.design!, glazing: 'generous' },
      } satisfies HouseRequirements,
    ],
    [
      'separate-kitchen gallery',
      {
        ...bungalow,
        name: 'Natural Minimal Bungalow',
        rooms: [
          room('Living and Dining Room', ['living', 'dining'], 'front'),
          room('Separate Kitchen', ['kitchen'], 'middle'),
          room('Bathroom', ['bathroom'], 'middle', 'compact'),
          room('Bedroom One', ['bedroom'], 'rear'),
          room('Bedroom Two', ['bedroom'], 'rear'),
        ],
        circulation: {
          family: 'side-gallery',
          gallerySide: 'left',
          stairPosition: 'rear',
          balance: 'balanced',
        },
        design: {
          style: 'natural-minimal',
          joinery: 'oak',
          hardware: 'black',
          exterior: { finish: 'plaster', color: '#e8e4da' },
          roof: { finish: 'metal', color: '#3c4140' },
        },
        wallColor: '#f4f2ec',
        upholsteryColor: '#9caf97',
        roof: 'gable',
      } satisfies HouseRequirements,
    ],
  ] as const)(
    'opens every generated fixture in the %s without obstructing furniture or room access',
    async (_name, requirements) => {
      const building = await generateLayout(
          `opening-regression-${_name.replaceAll(' ', '-')}`,
          requirements,
        ),
        fixtures = building.objects.filter((object) =>
          object.behaviours.some((behaviour) => behaviour.kind === 'openable'),
        );
      expect(fixtures.length).toBeGreaterThan(0);
      expect(fixtures.map((object) => object.assetId)).toEqual(
        expect.arrayContaining([
          'catalogue/fridge',
          'catalogue/kitchen-counter',
          'catalogue/wardrobe',
          'catalogue/vanity',
        ]),
      );
      if (_name.includes('bedside drawers'))
        expect(fixtures.filter((object) => object.assetId === 'catalogue/bedside')).toHaveLength(4);
      for (const fixture of fixtures) {
        const opened = validatePlacement(building, {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: building.revision,
          commands: [{ type: 'set-openable', objectId: fixture.id, state: { open: true } }],
        });
        expect(
          opened.building.objects.find((object) => object.id === fixture.id)?.behaviours,
        ).toContainEqual({ kind: 'openable', state: { open: true } });
        expect(checkClearance(opened.compiled), fixture.id).toEqual([]);
      }
      for (const bedside of fixtures.filter((object) => object.assetId === 'catalogue/bedside'))
        expect(bedside.rotation).toBe(Math.PI);
    },
    60000,
  );

  it('builds the complete three-bedroom two-storey gallery without counting blocked grid cells as graph nodes', async () => {
    const building = await generateLayout('gallery-grid-regression', gallery),
      compiled = compileBuilding(building),
      navigation = buildNavigation(compiled),
      entrance = entrancePoints(navigation)[0]!;
    expect(building.floors[0]!.footprint).toMatchObject({ width: 18, depth: 16.8 });
    expect(building.floors[1]!.rooms.filter((value) => value.kind === 'bedroom')).toHaveLength(3);
    expect(
      building.floors.flatMap((value) => value.rooms).filter((value) => value.kind === 'bathroom'),
    ).toHaveLength(2);
    expect(building.floors[0]!.rooms.some((value) => value.kind === 'workspace')).toBe(true);
    expect(navigation.nodes.length).toBeLessThanOrEqual(compiled.options.maxNodes);
    expect(checkReachability(navigation)).toEqual([]);
    expect(checkClearance(compiled)).toEqual([]);
    expect(findPath(navigation, entrance, compiled.stairs[0]!.upper)).not.toBeNull();
    expect(findPath(navigation, compiled.stairs[0]!.upper, entrance)).not.toBeNull();
  });
});
