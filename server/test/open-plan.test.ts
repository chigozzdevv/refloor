import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  checkClearance,
  compileBuilding,
  entrancePoints,
  findPath,
} from '@refloor/engine';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { minimumDepth } from '@refloor/server/shared/planning/constraints';
import { validateRequirements } from '@refloor/server/shared/planning/requirements';
import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';
import { roomZones } from '@refloor/server/shared/planning/zones';
import { roomWindows } from '@refloor/server/shared/planning/windows';

const room = (name: string, uses: RoomRequirement['uses'], floor = 0): RoomRequirement => ({
  name,
  floor,
  uses,
  size: 'standard',
  side: null,
  position: 'middle',
});

function brief(storeys: 1 | 2, uses: RoomRequirement['uses']): HouseRequirements {
  return {
    name: 'Open-plan home',
    storeys,
    width: null,
    depth: null,
    rooms: [
      room('Open-plan living', uses),
      room('Bathroom', ['bathroom']),
      room('Workspace', ['workspace']),
      room('Bedroom one', ['bedroom'], storeys - 1),
      room('Bedroom two', ['bedroom'], storeys - 1),
      ...(storeys === 2 ? [room('Upper bathroom', ['bathroom'], 1)] : []),
    ],
    wallColor: '#f5f0e6',
    upholsteryColor: '#8a9a7b',
    flooring: 'oak',
    roof: 'gable',
    unsupported: [],
  };
}

describe('open-plan residential generation', () => {
  it.each([1, 2] as const)(
    'builds a %i-storey open kitchen, dining and living home with complete reachable furnishings',
    async (storeys) => {
      const requirements = brief(storeys, ['living', 'dining', 'kitchen']),
        building = await generateLayout(`open-plan-${storeys}`, requirements),
        combined = building.floors[0]!.rooms.find((value) => value.name === 'Open-plan living')!,
        objects = building.objects.filter((value) => value.roomId === combined.id),
        compiled = compileBuilding(building),
        navigation = buildNavigation(compiled),
        entrance = entrancePoints(navigation)[0]!;
      expect(combined.uses).toEqual(['living', 'dining', 'kitchen']);
      expect(combined.kind).toBe('living');
      expect(objects.map((value) => value.assetId)).toEqual(
        expect.arrayContaining([
          'catalogue/sofa',
          'catalogue/television',
          'catalogue/dining-table',
          'catalogue/dining-chair',
          'catalogue/kitchen-counter',
          'catalogue/fridge',
        ]),
      );
      expect(objects.filter((value) => value.assetId === 'catalogue/dining-chair')).toHaveLength(4);
      expect(objects.filter((value) => value.assetId === 'catalogue/pendant')).toHaveLength(3);
      expect(checkClearance(compiled)).toEqual([]);
      const floor = building.floors[0]!;
      expect(
        floor.walls
          .flatMap((value) => value.openings)
          .filter((value) => value.id === `${combined.id}/door`),
      ).toHaveLength(1);
      expect(
        floor.walls
          .flatMap((value) => value.openings)
          .filter((value) => value.id.startsWith(`${combined.id}/window`)),
      ).toHaveLength(3);
      expect(
        building.floors
          .flatMap((value) => value.walls)
          .flatMap((value) => value.openings)
          .filter((value) => value.kind === 'door')
          .every((value) => value.kind === 'door' && !value.state.open),
      ).toBe(true);
      if (storeys === 2) {
        expect(floor.footprint.width).toBe(17);
        expect(findPath(navigation, entrance, compiled.stairs[0]!.upper)).not.toBeNull();
        expect(findPath(navigation, compiled.stairs[0]!.upper, entrance)).not.toBeNull();
      }
    },
  );

  it('supports a wide gallery open plan without adding partitions between its uses', async () => {
    const requirements = brief(1, ['living', 'kitchen']);
    requirements.rooms = requirements.rooms.slice(0, 3);
    requirements.circulation = {
      family: 'side-gallery',
      gallerySide: 'right',
      stairPosition: 'rear',
    };
    const building = await generateLayout('open-gallery', requirements),
      floor = building.floors[0]!,
      combined = floor.rooms.find((value) => value.name === 'Open-plan living')!,
      objects = building.objects.filter((value) => value.roomId === combined.id),
      sofa = objects.find((value) => value.kind === 'sofa')!,
      kitchen = objects.find((value) => value.assetId === 'catalogue/kitchen-counter')!;
    expect(combined.footprint.width).toBeCloseTo(12.2);
    expect(combined.footprint.depth).toBeLessThan(6);
    expect(kitchen.position.x - sofa.position.x).toBeGreaterThan(4);
    expect(combined.wallIds).toHaveLength(4);
  });

  it('keeps an explicitly narrow two-storey home usable with sequential public zones', async () => {
    const requirements = brief(2, ['living', 'dining', 'kitchen']);
    requirements.width = 14;
    requirements.depth = 12;
    const building = await generateLayout('narrow-open-plan', requirements),
      floor = building.floors[0]!,
      combined = floor.rooms.find((value) => value.name === 'Open-plan living')!,
      objects = building.objects.filter((value) => value.roomId === combined.id),
      sofa = objects.find((value) => value.kind === 'sofa')!,
      dining = objects.find((value) => value.assetId === 'catalogue/dining-table')!,
      kitchen = objects.find((value) => value.assetId === 'catalogue/kitchen-counter')!;
    expect(floor.footprint.width).toBe(14);
    expect(floor.footprint.depth).toBe(12);
    expect(combined.footprint.width).toBeCloseTo(4.3);
    expect(sofa.position.z).toBeLessThan(dining.position.z);
    expect(dining.position.z).toBeLessThan(kitchen.position.z);
    expect(sofa.rotation).toBe(Math.PI);
    expect(objects.find((value) => value.kind === 'television')!.rotation).toBe(0);
  });

  it('preserves half-decimetre wing widths when the overall footprint uses an odd decimetre', async () => {
    const requirements = brief(2, ['living', 'dining', 'kitchen']);
    requirements.width = 14.1;
    requirements.depth = 12;
    const building = await generateLayout('fractional-wing-width', requirements);
    for (const floor of building.floors) {
      expect(floor.footprint.width).toBe(14.1);
      expect(
        floor.rooms
          .filter((value) => value.kind !== 'corridor')
          .every((value) => Math.abs(value.footprint.width - 4.35) < 1e-6),
      ).toBe(true);
      expect(
        floor.rooms.reduce((sum, value) => sum + value.footprint.width * value.footprint.depth, 0),
      ).toBeCloseTo(14.1 * 12);
    }
  });

  it('builds genuinely different hall walls, room widths and entrance positions for a public-wide wing', async () => {
    const requirements = brief(2, ['living', 'dining', 'kitchen']);
    requirements.width = 18;
    requirements.depth = 12;
    requirements.circulation = {
      family: 'central-hall',
      gallerySide: 'left',
      stairPosition: 'rear',
      balance: 'balanced',
    };
    const balanced = await generateLayout('balanced-open-home', requirements);
    requirements.circulation.balance = 'public-wide';
    const wide = await generateLayout('public-wide-home', requirements),
      balancedFloor = balanced.floors[0]!,
      wideFloor = wide.floors[0]!,
      living = wideFloor.rooms.find((value) => value.name === 'Open-plan living')!,
      balancedLiving = balancedFloor.rooms.find((value) => value.name === 'Open-plan living')!,
      hall = wideFloor.rooms.find((value) => value.kind === 'corridor')!,
      balancedHall = balancedFloor.rooms.find((value) => value.kind === 'corridor')!,
      compiled = compileBuilding(wide),
      navigation = buildNavigation(compiled),
      entrance = entrancePoints(navigation)[0]!;
    expect(wideFloor.footprint).toEqual(balancedFloor.footprint);
    expect(living.footprint.width).toBeCloseTo(8.4);
    expect(balancedLiving.footprint.width).toBeCloseTo(6.3);
    expect(hall.footprint.x - balancedHall.footprint.x).toBeCloseTo(2.1);
    expect(wideFloor.walls.find((value) => value.id === 'ground/hall-0')!.start.x).toBeCloseTo(8.4);
    const door = (floor: typeof wideFloor) =>
      floor.walls
        .flatMap((value) => value.openings)
        .find((value) => value.id === 'ground/entrance')!;
    expect(door(wideFloor).offset - door(balancedFloor).offset).toBeCloseTo(2.1);
    expect(findPath(navigation, entrance, compiled.stairs[0]!.upper)).not.toBeNull();
    expect(checkClearance(compiled)).toEqual([]);
  });

  it('respects an explicit right public wing while choosing sufficient unspecified width', async () => {
    const requirements = brief(2, ['living', 'dining', 'kitchen']);
    requirements.rooms[0]!.side = 'right';
    requirements.circulation = {
      family: 'central-hall',
      gallerySide: 'left',
      stairPosition: 'front',
      balance: 'public-wide',
    };
    const building = await generateLayout('right-public-wing', requirements),
      floor = building.floors[0]!,
      living = floor.rooms.find((value) => value.name === 'Open-plan living')!,
      hall = floor.rooms.find((value) => value.kind === 'corridor')!;
    expect(floor.footprint.width).toBe(18);
    expect(living.footprint.width).toBeCloseTo(8.4);
    expect(hall.footprint.x).toBeCloseTo(4.2);
    expect(living.footprint.x).toBeCloseTo(9.6);
  });

  it('gives a five-room gallery enough width to furnish three public uses without exceeding depth limits', async () => {
    const requirements = brief(1, ['living', 'dining', 'kitchen']);
    requirements.circulation = {
      family: 'side-gallery',
      gallerySide: 'left',
      stairPosition: 'rear',
    };
    const building = await generateLayout('complete-open-gallery', requirements),
      floor = building.floors[0]!,
      living = floor.rooms.find((value) => value.name === 'Open-plan living')!;
    expect(floor.footprint.width).toBe(14.4);
    expect(floor.footprint.depth).toBeLessThanOrEqual(24);
    expect(living.footprint.width).toBeCloseTo(12.6);
    expect(living.footprint.depth).toBeLessThan(6);
    expect(
      building.objects.filter((value) => value.roomId === living.id && value.kind === 'light'),
    ).toHaveLength(3);
  });

  it('keeps private rooms enclosed and rejects repeated public uses', () => {
    const requirements = brief(1, ['living', 'kitchen']);
    requirements.rooms[0]!.uses = ['living', 'bedroom'];
    expect(() => validateRequirements(requirements)).toThrow('own enclosed room');
    requirements.rooms[0]!.uses = ['living', 'kitchen', 'kitchen'];
    expect(() => validateRequirements(requirements)).toThrow('repeat');
  });

  it('uses disjoint complete furnishing zones for narrow and wide combined spaces', () => {
    const requirement = room('Public room', ['living', 'dining', 'kitchen']);
    for (const width of [4.3, 6.1, 12.6]) {
      const footprint = { x: 2, z: 3, width, depth: minimumDepth(requirement, width) / 10 },
        zones = roomZones(requirement, footprint);
      expect(zones.map((value) => value.use).sort()).toEqual(['dining', 'kitchen', 'living']);
      expect(
        zones.reduce((sum, value) => sum + value.footprint.width * value.footprint.depth, 0),
      ).toBeCloseTo(width * footprint.depth);
      for (const [index, zone] of zones.entries())
        for (const other of zones.slice(0, index)) {
          const a = zone.footprint,
            b = other.footprint;
          expect(
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1e-6 ||
              Math.min(a.z + a.depth, b.z + b.depth) - Math.max(a.z, b.z) <= 1e-6,
          ).toBe(true);
        }
    }
  });

  it('sizes glazing by room use, with high bathroom privacy windows and repeated public glazing', () => {
    const footprint = { x: 0, z: 2, width: 6.1, depth: 12 },
      bathroom = roomWindows(room('Bath', ['bathroom']), footprint, undefined),
      publicRoom = roomWindows(room('Public room', ['living', 'kitchen']), footprint, undefined);
    expect(bathroom).toHaveLength(1);
    expect(bathroom[0]).toMatchObject({ sill: 1.65, height: 0.65, width: 1 });
    expect(publicRoom).toHaveLength(3);
    for (const window of publicRoom) {
      expect(window.offset).toBeGreaterThan(footprint.z);
      expect(window.offset + window.width).toBeLessThan(footprint.z + footprint.depth);
    }
  });

  it('increases actual window area for generous glazing while retaining bathroom privacy', () => {
    const footprint = { x: 0, z: 0, width: 8.4, depth: 12 },
      standard: NonNullable<HouseRequirements['design']> = {
        style: 'warm-contemporary',
        glazing: 'standard',
        joinery: 'oak',
        hardware: 'black',
        exterior: { finish: 'plaster', color: '#e8e4da' },
        roof: { finish: 'metal', color: '#444444' },
      },
      generous = { ...standard, glazing: 'generous' } as const,
      publicRoom = room('Public room', ['living', 'kitchen']),
      normalWindows = roomWindows(publicRoom, footprint, standard),
      generousWindows = roomWindows(publicRoom, footprint, generous),
      area = (windows: typeof normalWindows) =>
        windows.reduce((sum, value) => sum + value.width * value.height, 0);
    expect(generousWindows.length).toBeGreaterThan(normalWindows.length);
    expect(area(generousWindows)).toBeGreaterThan(area(normalWindows) * 1.4);
    expect(roomWindows(room('Bath', ['bathroom']), footprint, generous)).toEqual(
      roomWindows(room('Bath', ['bathroom']), footprint, undefined),
    );
  });
});
