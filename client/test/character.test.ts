import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/blueprints';
import { applyCommands } from '@refloor/scene';
import { buildNavigation, compileBuilding, findPath } from '@refloor/engine';
import type { Point3 } from '@refloor/engine';
import { CharacterWorld, initializePhysics } from '@/runtime/physics/CharacterWorld';
import { entryPose } from '@/runtime/physics/entry';

beforeAll(initializePhysics);

function walk(world: CharacterWorld, points: Point3[]) {
  for (const point of points) {
    let arrived = false;
    for (let i = 0; i < 420; i++) {
      const position = world.feet,
        dx = point.x - position.x,
        dz = point.z - position.z,
        length = Math.hypot(dx, dz);
      if (length < 0.025) {
        arrived = true;
        break;
      }
      const speed = Math.min(1.5, length * 60);
      world.step({ x: (dx / length) * speed, z: (dz / length) * speed }, 1 / 60);
    }
    if (!arrived) throw new Error(`Character blocked before ${JSON.stringify(point)}`);
  }
  for (let i = 0; i < 60; i++) world.step({ x: 0, z: 0 }, 1 / 60);
}

describe('browser character runtime', () => {
  it('walks the generated house and climbs its actual staircase', () => {
    const building = createHouse({ id: 'walkthrough', name: 'Walkthrough', storeys: 2 });
    const doors = building.floors.flatMap((floor) =>
      floor.walls.flatMap((wall) => wall.openings.filter((opening) => opening.kind === 'door')),
    );
    const changed = applyCommands(building, {
      id: 'open-doors',
      at: '2026-10-18T12:00:00Z',
      expectedRevision: 0,
      commands: doors.map((door) => ({ type: 'set-door', doorId: door.id, open: true })),
    });
    const compiled = compileBuilding(changed.building),
      entry = entryPose(compiled),
      navigation = buildNavigation(compiled, 'current'),
      stair = compiled.stairs[0];
    if (!stair) throw new Error('Stair missing');
    const route = findPath(
      navigation,
      { floorId: entry.floorId, position: entry.inside },
      stair.upper,
    );
    if (!route) throw new Error('Walking route missing');
    const world = new CharacterWorld(compiled);
    try {
      walk(world, route.points);
      expect(world.feet.y).toBeCloseTo(3, 1);
      expect(world.player.floorId).toBe('first');
      walk(world, route.points.toReversed());
      expect(world.feet.y).toBeCloseTo(0, 1);
    } finally {
      world.dispose();
    }
  }, 15_000);

  it('preserves the player position when an edited scene rebuilds the world', () => {
    const compiled = compileBuilding(createHouse({ id: 'edits', name: 'Edits', storeys: 1 }));
    let world = new CharacterWorld(compiled);
    for (let i = 0; i < 60; i++) world.step({ x: 0, z: 0 }, 1 / 60);
    const position = world.feet;
    try {
      for (let i = 0; i < 8; i++) {
        const feet = world.feet;
        world.dispose();
        world = new CharacterWorld(compiled, feet);
      }
      expect(world.feet.y).toBeCloseTo(position.y, 5);
      expect(world.feet.x).toBeCloseTo(position.x, 5);
    } finally {
      world.dispose();
    }
  });

  it('detects a door sweeping through the player while its final open position is clear', () => {
    const compiled = compileBuilding(createHouse({ id: 'door', name: 'Door', storeys: 1 })),
      world = new CharacterWorld(compiled),
      door = entryPose(compiled).doorId;
    try {
      expect(world.doorBlocked(door, 0.5)).toBe(true);
      expect(world.doorBlocked(door, 1)).toBe(false);
    } finally {
      world.dispose();
    }
  });
});
