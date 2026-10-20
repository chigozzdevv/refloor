import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { findCataloguePlacement, placementProfile } from '@refloor/catalogue';
import { compileBuilding, isPlayerPositionValid, validatePlacement } from '@refloor/engine';

function scene() {
  return compileBuilding(
    createHouse({ id: 'placement', name: 'Placement', storeys: 1, width: 16, depth: 14 }),
  );
}
describe('semantic catalogue placement', () => {
  it('keeps doorway sweeps clear and rejects a floor pose for a wall-mounted television', () => {
    const compiled = scene(),
      room = compiled.building.floors[0]!.rooms[0]!,
      door = compiled.doors.find((door) => door.id === 'ground/entrance')!;
    const chair = findCataloguePlacement(compiled, 'catalogue/chair', room.id, {
      preferred: [{ position: { ...door.centre, y: 0 }, rotation: 0 }],
    });
    expect(
      Math.hypot(chair.position.x - door.centre.x, chair.position.z - door.centre.z),
    ).toBeGreaterThan(0.6);
    expect(() =>
      findCataloguePlacement(compiled, 'catalogue/television', room.id, {
        preferred: [{ position: { x: 4, y: 0, z: 4 }, rotation: 0 }],
        search: false,
      }),
    ).toThrow('safe placement');
  });

  it('finds an alternative clear placement without occupying the player', () => {
    const compiled = scene(),
      room = compiled.building.floors[0]!.rooms[0]!,
      first = findCataloguePlacement(compiled, 'catalogue/chair', room.id),
      player = { floorId: first.floorId, position: first.position };
    expect(isPlayerPositionValid(compiled, player)).toBe(true);
    const placed = findCataloguePlacement(compiled, 'catalogue/chair', room.id, { player });
    expect(placed.position).not.toEqual(first.position);
    const result = validatePlacement(
      compiled.building,
      {
        id: 'add-around-player',
        at: '2026-10-20T15:00:00Z',
        expectedRevision: 0,
        commands: [{ type: 'add-object', object: placed }],
      },
      {},
      player,
    );
    expect(isPlayerPositionValid(result.compiled, player)).toBe(true);
  });

  it('places exterior planters outside the building footprint with ground support', () => {
    const compiled = scene(),
      floor = compiled.building.floors[0]!;
    const placed = findCataloguePlacement(
      compiled,
      'catalogue/outdoor-planter',
      floor.rooms[0]!.id,
    );
    expect(placed.placement).toBe('exterior');
    expect(placed.position.y).toBe(0);
    expect(
      placed.position.x < floor.footprint.x ||
        placed.position.x > floor.footprint.x + floor.footprint.width ||
        placed.position.z < floor.footprint.z ||
        placed.position.z > floor.footprint.z + floor.footprint.depth,
    ).toBe(true);
    expect(placementProfile('catalogue/wall-light').location).toBe('exterior');
  });
});
