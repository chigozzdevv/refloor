import { expect, it } from 'vitest';
import { buildNavigation, compileBuilding, entrancePoints, findPath } from '@refloor/engine';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { validateRequirements } from '@refloor/server/shared/planning/requirements';
import type { HouseRequirements } from '@refloor/server/shared/planning/requirements';

const brief = (): HouseRequirements => ({
  name: 'Parlor bungalow',
  storeys: 1,
  width: null,
  depth: null,
  rooms: [
    { name: 'Parlor & dining', uses: ['living', 'dining'] as const },
    { name: 'Kitchen', uses: ['kitchen'] as const },
    { name: 'Bathroom', uses: ['bathroom'] as const },
    { name: 'Primary bedroom', uses: ['bedroom'] as const },
    { name: 'Guest bedroom', uses: ['bedroom'] as const },
  ].map(({ name, uses }) => ({
    name,
    uses: [...uses],
    floor: 0,
    size: 'standard',
    side: null,
    position: 'middle',
  })),
  circulation: {
    family: 'living-hub',
    gallerySide: 'left',
    stairPosition: 'rear',
    balance: 'balanced',
  },
  design: {
    style: 'warm-contemporary',
    joinery: 'oak',
    hardware: 'brass',
    glazing: 'generous',
    audio: 'stereo',
    exterior: { finish: 'brick', color: '#ffffff' },
    roof: { finish: 'metal', color: '#333333' },
  },
  wallColor: '#f5f0e6',
  upholsteryColor: '#aca08a',
  flooring: 'oak',
  roof: 'gable',
  unsupported: [],
});

it('enters the furnished parlor and connects every enclosed room directly without a corridor', async () => {
  const building = await generateLayout('parlor-bungalow', brief());
  const floor = building.floors[0]!,
    living = floor.rooms.find((room) => room.kind === 'living')!;
  expect(floor.rooms).toHaveLength(5);
  expect(floor.rooms.some((room) => room.kind === 'corridor')).toBe(false);
  const compiled = compileBuilding(building),
    navigation = buildNavigation(compiled),
    entrance = entrancePoints(navigation)[0]!;
  expect(entrance.position.x).toBeGreaterThan(living.footprint.x);
  expect(entrance.position.x).toBeLessThan(living.footprint.x + living.footprint.width);
  for (const room of floor.rooms.filter((room) => room !== living)) {
    const wall = floor.walls.find((wall) =>
      wall.openings.some((door) => door.id === `${room.id}/door`),
    )!;
    expect(living.wallIds).toContain(wall.id);
    expect(room.wallIds).toContain(wall.id);
    const target = navigation.nodes.find(
      (node) =>
        node.floorId === floor.id &&
        node.position.x > room.footprint.x + 0.3 &&
        node.position.x < room.footprint.x + room.footprint.width - 0.3 &&
        node.position.z > room.footprint.z + 0.3 &&
        node.position.z < room.footprint.z + room.footprint.depth - 0.3,
    )!;
    expect(findPath(navigation, entrance, target)).not.toBeNull();
  }
  expect(
    building.objects
      .filter((object) => object.roomId === living.id)
      .map((object) => object.assetId),
  ).toEqual(
    expect.arrayContaining([
      'catalogue/sofa',
      'catalogue/dining-table',
      'catalogue/dining-chair',
      'catalogue/television',
      'catalogue/speaker',
    ]),
  );
  expect(compiled.doors.every((door) => !door.open)).toBe(true);
});

it('rejects incompatible living-hub briefs instead of adding a hidden passage', async () => {
  const two = brief();
  two.storeys = 2;
  two.rooms.push(
    { ...two.rooms[4]!, name: 'Upper room', floor: 1 },
    { ...two.rooms[2]!, name: 'Upper bathroom', floor: 1 },
  );
  expect(() => validateRequirements(two)).toThrow('bungalows');
  const small = brief();
  small.width = 14;
  await expect(generateLayout('small-hub', small)).rejects.toThrow('too narrow');
});
