import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  entrancePoints,
  findPath,
  compileBuilding,
  checkReachability,
} from '@refloor/engine';
import { zodTextFormat } from 'openai/helpers/zod';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import {
  validateRequirements,
  houseResponseSchema,
} from '@refloor/server/shared/planning/requirements';
import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';

const room = (name: string, uses: RoomRequirement['uses'], floor = 0): RoomRequirement => ({
  name,
  uses,
  floor,
  size: 'standard',
  side: null,
  position: 'middle',
});
const brief = (): HouseRequirements => ({
  name: 'Planning test',
  storeys: 1,
  width: 14,
  depth: null,
  rooms: [
    room('Living & dining', ['living', 'dining']),
    room('Kitchen', ['kitchen']),
    room('Bathroom', ['bathroom']),
    room('Bedroom one', ['bedroom']),
    room('Bedroom two', ['bedroom']),
    room('Study', ['workspace']),
  ],
  wallColor: '#F5F0E6',
  upholsteryColor: '#8A9A7B',
  flooring: 'oak',
  roof: 'flat',
  unsupported: [],
});
const design = (): NonNullable<HouseRequirements['design']> => ({
  style: 'warm-contemporary',
  joinery: 'walnut',
  hardware: 'brass',
  exterior: { finish: 'brick', color: '#ffffff' },
  roof: { finish: 'metal', color: '#64716b' },
});

describe('Z3 house generation', () => {
  it('builds the requested rooms, finishes and functional assets with complete floor coverage', async () => {
    const requirements = brief();
    const building = await generateLayout('bungalow-test', requirements);
    const floor = building.floors[0]!;
    expect(floor.rooms.filter((item) => item.kind === 'bedroom')).toHaveLength(2);
    expect(floor.rooms.map((item) => item.name)).toEqual(
      expect.arrayContaining(requirements.rooms.map((item) => item.name)),
    );
    expect(
      floor.rooms.reduce((area, item) => area + item.footprint.width * item.footprint.depth, 0),
    ).toBeCloseTo(floor.footprint.width * floor.footprint.depth);
    expect(
      floor.walls.every((wall) => wall.material.color === requirements.wallColor.toLowerCase()),
    ).toBe(true);
    expect(building.objects.find((item) => item.kind === 'television')?.behaviours[0]?.kind).toBe(
      'television',
    );
    expect(building.objects.filter((item) => item.kind === 'bed')).toHaveLength(2);
    expect(building.objects.map((item) => item.assetId)).toEqual(
      expect.arrayContaining([
        'catalogue/kitchen-counter',
        'catalogue/fridge',
        'catalogue/vanity',
        'catalogue/toilet',
        'catalogue/shower',
        'catalogue/desk',
        'catalogue/wardrobe',
      ]),
    );
  });

  it('coordinates both floors, stair openings and navigable routes to every room', async () => {
    const requirements = brief();
    requirements.storeys = 2;
    requirements.depth = 12;
    requirements.flooring = 'walnut';
    requirements.roof = 'gable';
    requirements.rooms = [
      room('Living & dining', ['living', 'dining']),
      room('Kitchen', ['kitchen']),
      room('Bathroom', ['bathroom']),
      room('Study', ['workspace']),
      room('Bedroom one', ['bedroom'], 1),
      room('Bedroom two', ['bedroom'], 1),
      room('Bedroom three', ['bedroom'], 1),
      room('Upper bathroom', ['bathroom'], 1),
    ];
    const building = await generateLayout('two-storey-test', requirements);
    const compiled = compileBuilding(building),
      navigation = buildNavigation(compiled);
    const entrance = entrancePoints(navigation)[0]!;
    const stair = compiled.stairs[0]!;
    expect(findPath(navigation, entrance, stair.upper)).not.toBeNull();
    expect(building.floors[1]!.rooms.filter((item) => item.kind === 'bedroom')).toHaveLength(3);
    expect(building.floors[1]!.voids[0]!.id).toBe(building.stairs[0]!.openingId);
    expect(building.roof.kind).toBe('gable');
  });

  it('honours fixed side assignments and changes geometry for a different programme', async () => {
    const requirements = brief();
    requirements.rooms = [
      room('Living', ['living']),
      room('Kitchen', ['kitchen']),
      room('Bath', ['bathroom']),
      room('Bedroom', ['bedroom']),
    ];
    requirements.rooms[0]!.side = 'right';
    const building = await generateLayout('side-test', requirements);
    const floor = building.floors[0]!;
    expect(floor.rooms.find((item) => item.kind === 'living')!.footprint.x).toBeGreaterThan(7);
    expect(floor.rooms).toHaveLength(5);
  });

  it('rejects impossible dimensions without dropping rooms or substituting a prepared home', async () => {
    const requirements = brief();
    requirements.depth = 9;
    await expect(generateLayout('cannot-fit', requirements)).rejects.toThrow('do not fit');
  });

  it('rejects unsupported or inconsistent programmes before solving', () => {
    expect(
      houseResponseSchema.parse({ requirements: null, unsupported: ['basement'] }).requirements,
    ).toBeNull();
    expect(() => validateRequirements({ ...brief(), unsupported: ['basement'] })).toThrow(
      'basement',
    );
    const requirements = brief();
    requirements.rooms[0]!.floor = 1;
    expect(() => validateRequirements(requirements)).toThrow('outside');
  });

  it('solves distinct central and gallery circulation geometry for the same room programme', async () => {
    const requirements = brief();
    requirements.rooms = requirements.rooms.slice(0, 4);
    requirements.design = design();
    const central = await generateLayout('central-family', requirements);
    requirements.circulation = {
      family: 'side-gallery',
      gallerySide: 'left',
      stairPosition: 'rear',
    };
    const gallery = await generateLayout('gallery-family', requirements),
      centralFloor = central.floors[0]!,
      galleryFloor = gallery.floors[0]!;
    expect(centralFloor.rooms.find((value) => value.kind === 'corridor')!.footprint.x).toBe(6.1);
    expect(galleryFloor.rooms.find((value) => value.kind === 'corridor')!.footprint.x).toBe(0);
    expect(galleryFloor.footprint.depth).toBeGreaterThan(centralFloor.footprint.depth);
    expect(
      galleryFloor.rooms
        .filter((value) => value.kind !== 'corridor')
        .every((value) => Math.abs(value.footprint.width - 12.2) < 1e-6),
    ).toBe(true);
    expect(
      galleryFloor.walls.find((value) => value.id === 'ground/west')!.openings.length,
    ).toBeGreaterThan(2);
    expect(
      galleryFloor.rooms.reduce(
        (sum, value) => sum + value.footprint.width * value.footprint.depth,
        0,
      ),
    ).toBeCloseTo(galleryFloor.footprint.width * galleryFloor.footprint.depth);
    expect(gallery.objects.some((value) => value.id.endsWith('lounge-chair-left'))).toBe(true);
    const floodlights = gallery.objects.filter((value) => value.assetId === 'catalogue/floodlight');
    expect(floodlights).toHaveLength(2);
    expect(
      floodlights.every(
        (value) =>
          value.position.x - value.dimensions.width / 2 >= 0.12 &&
          value.position.x + value.dimensions.width / 2 <= galleryFloor.footprint.width - 0.12,
      ),
    ).toBe(true);
    const living = galleryFloor.rooms.find((value) => value.kind === 'living')!,
      sofa = gallery.objects.find((value) => value.kind === 'sofa')!,
      table = gallery.objects.find((value) => value.assetId === 'catalogue/dining-table')!;
    expect(living.footprint.depth).toBeLessThan(8);
    expect(sofa.position.x - table.position.x).toBeGreaterThan(4);
  });

  it.each([
    ['left', 'front'],
    ['left', 'rear'],
    ['right', 'front'],
    ['right', 'rear'],
  ] as const)(
    'validates both floors and every usable destination for a %s gallery with %s stairs',
    async (gallerySide, stairPosition) => {
      const requirements = brief();
      requirements.storeys = 2;
      requirements.design = design();
      requirements.circulation = { family: 'side-gallery', gallerySide, stairPosition };
      requirements.rooms = [
        room('Living & dining', ['living', 'dining']),
        room('Kitchen', ['kitchen']),
        room('Bathroom', ['bathroom']),
        room('Bedroom one', ['bedroom'], 1),
        room('Bedroom two', ['bedroom'], 1),
        room('Upper bathroom', ['bathroom'], 1),
      ];
      requirements.rooms[0]!.position = 'front';
      requirements.rooms[1]!.position = 'middle';
      requirements.rooms[2]!.position = 'rear';
      const building = await generateLayout(
          `gallery-${gallerySide}-${stairPosition}`,
          requirements,
        ),
        compiled = compileBuilding(building),
        navigation = buildNavigation(compiled),
        entrance = entrancePoints(navigation)[0]!;
      expect(checkReachability(navigation)).toEqual([]);
      const stair = compiled.stairs[0]!;
      expect(findPath(navigation, entrance, stair.upper)).not.toBeNull();
      expect(findPath(navigation, stair.upper, entrance)).not.toBeNull();
      expect(building.stairs[0]!.heading).toBe(stairPosition === 'rear' ? 0 : Math.PI);
      const hall = building.floors[0]!.rooms.find((value) => value.kind === 'corridor')!;
      expect(hall.footprint.x).toBe(gallerySide === 'left' ? 0 : 8.6);
      const programmed = building.floors[0]!.rooms.filter((value) => value.kind !== 'corridor');
      expect(programmed.map((value) => value.name)).toEqual([
        'Living & dining',
        'Kitchen',
        'Bathroom',
      ]);
      expect(building.floors[1]!.rooms.filter((value) => value.kind === 'bedroom')).toHaveLength(2);
      const floodlights = building.objects.filter(
        (value) => value.assetId === 'catalogue/floodlight',
      );
      expect(floodlights).toHaveLength(2);
      for (const light of floodlights) {
        expect(light.position.x - light.dimensions.width / 2).toBeGreaterThan(0.12);
        expect(light.position.x + light.dimensions.width / 2).toBeLessThan(14 - 0.12);
      }
    },
  );

  it('applies the specified interior, joinery, exterior and roof palette to editable surfaces', async () => {
    const requirements = brief();
    requirements.design = { ...design(), style: 'moody-modern' };
    requirements.wallColor = '#4f5652';
    requirements.upholsteryColor = '#aa8b68';
    requirements.flooring = 'walnut';
    const building = await generateLayout('coordinated-design', requirements);
    expect(building.roof.material).toMatchObject({ textureId: 'metal-roof', color: '#64716b' });
    for (const floor of building.floors) {
      expect(floor.walls.every((value) => value.material.color === '#4f5652')).toBe(true);
      expect(floor.walls.filter((value) => value.exteriorMaterial)).toHaveLength(4);
      expect(
        floor.walls.every(
          (value) => !value.exteriorMaterial || value.exteriorMaterial.textureId === 'brick',
        ),
      ).toBe(true);
      expect(floor.rooms.every((value) => value.floorMaterial.textureId === 'wood-floor')).toBe(
        true,
      );
    }
    const sideboard = building.objects.find((value) => value.assetId === 'catalogue/cabinet')!,
      kitchen = building.objects.find((value) => value.assetId === 'catalogue/kitchen-counter')!;
    expect(sideboard.materials.body).toMatchObject({ textureId: 'wood-veneer', color: '#9c7854' });
    expect(kitchen.materials.body).toEqual(sideboard.materials.body);
    expect(kitchen.materials.top).toMatchObject({ textureId: 'marble-slab' });
    expect(kitchen.materials.frame).toMatchObject({ color: '#c4a36a', metalness: 0.85 });
    expect(
      building.objects
        .filter((value) => ['sofa', 'chair', 'bed'].includes(value.kind))
        .every((value) => value.materials.body!.color === '#aa8b68'),
    ).toBe(true);
    const pendant = building.objects.find((value) => value.assetId === 'catalogue/pendant')!;
    expect(pendant.behaviours[0]).toMatchObject({ state: { color: '#ffd2a2', powered: true } });
  });

  it('keeps a five-room natural gallery home complete and fits lights onto its edge entrance facade', async () => {
    const requirements = brief();
    requirements.rooms = requirements.rooms.slice(0, 5);
    requirements.circulation = {
      family: 'side-gallery',
      gallerySide: 'right',
      stairPosition: 'rear',
    };
    requirements.design = {
      ...design(),
      style: 'natural-minimal',
      joinery: 'oak',
      hardware: 'black',
      exterior: { finish: 'marble', color: '#ffffff' },
      roof: { finish: 'asphalt', color: '#777a76' },
    };
    const building = await generateLayout('natural-gallery', requirements),
      floor = building.floors[0]!;
    expect(floor.rooms.filter((value) => value.kind === 'bedroom')).toHaveLength(2);
    expect(floor.footprint.depth).toBeLessThanOrEqual(24);
    expect(building.roof.material).toMatchObject({ textureId: 'roof-asphalt', color: '#777a76' });
    expect(floor.walls.find((value) => value.id === 'ground/east')!.exteriorMaterial).toMatchObject(
      {
        textureId: 'marble',
      },
    );
    const floodlights = building.objects.filter(
      (value) => value.assetId === 'catalogue/floodlight',
    );
    expect(floodlights).toHaveLength(2);
    expect(
      floodlights.every(
        (value) =>
          value.position.x - value.dimensions.width / 2 >= 0.12 &&
          value.position.x + value.dimensions.width / 2 <= floor.footprint.width - 0.12,
      ),
    ).toBe(true);
    expect(building.objects.some((value) => value.id.endsWith('lounge-chair-right'))).toBe(false);
  });

  it('retains strict AI output support while accepting previous saved room programmes', () => {
    expect(() => zodTextFormat(houseResponseSchema, 'house_brief')).not.toThrow();
    expect(validateRequirements(brief()).circulation).toBeUndefined();
    const requirements = brief();
    requirements.circulation = {
      family: 'side-gallery',
      gallerySide: 'left',
      stairPosition: 'rear',
    };
    requirements.rooms[0]!.side = 'left';
    expect(() => validateRequirements(requirements)).toThrow('opposite side');
  });
});
