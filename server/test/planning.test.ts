import { describe, expect, it } from 'vitest';
import { buildNavigation, entrancePoints, findPath, validateBuilding } from '@refloor/engine';
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
    const compiled = validateBuilding(building),
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
});
