import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { buildNavigation, compileBuilding, findPath } from '@refloor/engine';
import type { Point3 } from '@refloor/engine';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { entryPose } from '@/shared/navigation/entry';
import { destinationRoute, destinations, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';

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
  it('waits clear of a nearby swinging door before accepting walking input', () => {
    const building = createHouse({ id: 'swing-wait', name: 'Swing wait', storeys: 1 });
    const initial = compileBuilding(building),
      entry = entryPose(initial);
    const opened = applyCommands(building, {
      id: 'open',
      at: '2026-10-18T12:00:00Z',
      expectedRevision: building.revision,
      commands: [{ type: 'set-door', doorId: entry.doorId, open: true }],
    });
    const world = new CharacterWorld(compileBuilding(opened.building), entry.inside);
    try {
      world.setDoorFraction(entry.doorId, 0.2);
      const before = world.feet;
      for (let frame = 0; frame < 20; frame++) world.step({ x: 0, z: 1 }, 1 / 60);
      expect(Math.hypot(world.feet.x - before.x, world.feet.z - before.z)).toBeLessThan(0.001);
      world.setDoorFraction(entry.doorId, 1);
      for (let frame = 0; frame < 20; frame++) world.step({ x: 0, z: 1 }, 1 / 60);
      expect(Math.hypot(world.feet.x - before.x, world.feet.z - before.z)).toBeGreaterThan(0.1);
    } finally {
      world.dispose();
    }
  });
  it('travels to stair destinations in both directions and resumes after stopping mid-flight', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'continuous-stairs', name: 'Continuous stairs', storeys: 2 }),
    );
    const stair = compiled.stairs[0]!;
    const world = new CharacterWorld(compiled, {
      x: stair.lower.position.x + 1.15,
      y: 0,
      z: stair.lower.position.z - 0.4,
    });
    const travel = (target: typeof stair.upper) => {
      const path = destinationRoute(compiled, world.player, target, 'current');
      expect(path).not.toBeNull();
      const journey = createJourney(smoothRoute(compiled, path!.points));
      for (let i = 0; i < 6000; i++) {
        const status = stepJourney(world, journey, 1 / 60);
        if (status === 'arrived') return;
        if (status === 'blocked') throw new Error('Journey was blocked');
      }
      throw new Error('Journey did not arrive');
    };
    try {
      travel(stair.upper);
      expect(world.player.floorId).toBe('first');
      travel(stair.lower);
      expect(world.player.floorId).toBe('ground');
      walk(world, stair.path.slice(0, 6));
      travel(stair.upper);
      expect(world.feet.y).toBeCloseTo(stair.upper.position.y, 1);
    } finally {
      world.dispose();
    }
  }, 15000);
  it('opens the doors on a room route and follows the smoothed path through actual colliders', () => {
    const building = createHouse({ id: 'destinations', name: 'Destinations', storeys: 1 }),
      initial = compileBuilding(building),
      entry = entryPose(initial),
      from = { floorId: entry.floorId, position: entry.inside };
    const target = destinations(initial).find(
      (destination) =>
        destination.kind === 'room' &&
        destinationRoute(initial, from, destination.target, 'openable')?.doorIds.length,
    )!;
    expect(target).toBeDefined();
    const proposed = destinationRoute(initial, from, target.target, 'openable')!;
    expect(destinationRoute(initial, from, target.target, 'current')).toBeNull();
    const opened = applyCommands(building, {
      id: 'open-route-doors',
      at: '2026-10-18T12:00:00Z',
      expectedRevision: building.revision,
      commands: proposed.doorIds.map((doorId) => ({ type: 'set-door', doorId, open: true })),
    });
    const compiled = compileBuilding(opened.building),
      path = destinationRoute(compiled, from, target.target, 'current')!;
    expect(path).not.toBeNull();
    const journey = createJourney(smoothRoute(compiled, path.points)),
      world = new CharacterWorld(compiled);
    try {
      let status = stepJourney(world, journey, 1 / 60);
      for (let i = 0; i < 6000 && status === 'moving'; i++)
        status = stepJourney(world, journey, 1 / 60);
      expect(status).toBe('arrived');
      expect(
        Math.hypot(
          world.feet.x - target.target.position.x,
          world.feet.z - target.target.position.z,
        ),
      ).toBeLessThan(0.05);
      const stopped = world.feet;
      for (let i = 0; i < 60; i++) world.step({ x: 0, z: 0 }, 1 / 60);
      expect(Math.hypot(world.feet.x - stopped.x, world.feet.z - stopped.z)).toBeLessThan(0.001);
    } finally {
      world.dispose();
    }
  }, 15000);
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
      world = new CharacterWorld(compiled, entryPose(compiled).threshold),
      door = entryPose(compiled).doorId;
    try {
      expect(world.doorBlocked(door, 0.5)).toBe(true);
      expect(world.doorBlocked(door, 1)).toBe(false);
      expect(world.canSwingDoor(door, true)).toBe(false);
      world.teleport(entryPose(compiled).inside);
      expect(world.canSwingDoor(door, true)).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
